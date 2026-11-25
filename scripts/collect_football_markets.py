#!/usr/bin/env python3
"""Collect actual Winamax goal totals within the shared monthly/daily credit allowance."""
import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
from urllib.error import HTTPError
import update_odds as api
import update_sports as validate
from collect_quotes import retry_get
from check_quotes import error_info

ROOT=Path(__file__).resolve().parents[1]/'data'
VERSION='football-paired-markets-v1'

def read(name,fallback):
    try:return json.loads((ROOT/name).read_text())
    except (OSError,ValueError):return fallback

def stamp(value):return dt.datetime.fromisoformat(value.replace('Z','+00:00'))
def identity(m):return (api.slug(m['home']),api.slug(m['away']),stamp(m['kickoff']))
def save(name,value):(ROOT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

def daily_budget(remaining,now):
    nxt=(now.replace(day=1)+dt.timedelta(days=32)).replace(day=1)
    days=max(1,(nxt.date()-now.date()).days)
    return min(18,max(0,math.ceil((remaining-4)/days)))

def collector_code(key):return validate.football_code(key)

def candidates(now):
    lookup={code:key for key,code,*_ in api.LEAGUES};groups={}
    source=read('sports/football.json',{})
    for league in source.get('competitions',[]):
        if isinstance(league.get('key'),str):lookup[collector_code(league['key'])]=league['key']
    for file in sorted((ROOT/'days').glob('????-??-??.json')):
        try:doc=json.loads(file.read_text())
        except (OSError,ValueError):continue
        for m in doc.get('matches',[]):
            key=lookup.get(m.get('league'))
            try:
                if not key or not now<stamp(m['kickoff'])<=now+dt.timedelta(hours=36):continue
                group=groups.setdefault(key,{'key':key,'title':m.get('leagueTitle') or m['league'],'matches':[],'own':0})
                group['matches'].append(m);group['own']+=m.get('mine',{}).get('bookKey')=='winamax_fr'
            except (ValueError,KeyError,TypeError):continue
    return sorted(groups.values(),key=lambda g:(-g['own'],-len(g['matches']),min(stamp(m['kickoff']) for m in g['matches']),g['key']))

def extract(event,title,key,now):
    try:
        kickoff=stamp(event['commence_time'])
        if kickoff<=now:return None
        groups=validate.market_groups(event,'football',now)
        if not groups:return None
        m={'id':'football-'+event['id'],'eventId':event['id'],'sport':'football','sportKey':key,'leagueCode':validate.football_code(key),'league':title,'home':event['home_team'],'away':event['away_team'],'kickoff':event['commence_time'],'asOf':min(g['asOf'] for g in groups),'bookKey':'winamax_fr','book':'Winamax France','market':'h2h' if any(g['family']=='h2h' for g in groups) else 'totals','markets':groups,'gender':'women' if validate.female_competition(key,title) else 'unspecified'}
        winner=next((g for g in groups if g['family']=='h2h'),None)
        if winner:
            for o in winner['outcomes']:m[{'1':'o1','2':'o2','X':'oX'}[o['side']]]=o['odds']
        return m
    except (KeyError,ValueError,TypeError):return None

def publish(matches,now):
    source=read('sports/football.json',{'sport':'football','bookKey':'winamax_fr','matches':[],'fixtures':[]})
    by_id={identity(m):m for m in source.get('matches',[]) if m.get('kickoff')}
    for m in matches:
        old=by_id.get(identity(m))
        if old:
            groups={g['id']:g for g in old.get('markets',[]) if 0 <= (now-stamp(g['asOf'])).total_seconds() <= 3600};groups.update({g['id']:g for g in m['markets']});m={**old,**m,'markets':list(groups.values())}
        winner=next((g for g in m['markets'] if g['family']=='h2h'),None)
        if not winner:
            for field in ['o1','oX','o2']:m.pop(field,None)
            m['market']='totals'
        else:
            for outcome in winner['outcomes']:m[{'1':'o1','X':'oX','2':'o2'}[outcome['side']]]=outcome['odds']
        m['asOf']=min((g['asOf'] for g in m['markets']),key=stamp)
        by_id[identity(m)]=m
        file=ROOT/'days'/(dt.datetime.fromisoformat(m['kickoff'].replace('Z','+00:00')).astimezone(api.PARIS).strftime('%Y-%m-%d')+'.json')
        if not file.exists():continue
        doc=json.loads(file.read_text());target=next((v for v in doc.get('matches',[]) if identity(v)==identity(m)),None)
        if target is None:continue
        own=target.setdefault('mine',{'book':'Winamax France','bookKey':'winamax_fr','ou':{}})
        own.setdefault('ou',{})
        winner=next((g for g in m['markets'] if g['family']=='h2h'),None)
        if winner:
            own.update(asOf=winner['asOf'],o1=m['o1'],oX=m['oX'],o2=m['o2'])
        for g in m['markets']:
            if g['family']!='totals':continue
            values={o['side']:o['odds'] for o in g['outcomes']}
            own['ou'][str(g['line'])]={'o':values['over'],'u':values['under'],'asOf':g['asOf'],'quoteSource':'api'}
        doc['marketsUpdatedAt']=now.isoformat();file.write_text(json.dumps(doc,ensure_ascii=False,indent=1)+'\n')
    if matches:
        source.update(status='ok',updatedAt=now.isoformat(),matches=list(by_id.values()),partial=True,ingestionVersion=VERSION)
        save('sports/football.json',source)

def run(now=None):
    now=now or dt.datetime.now(dt.timezone.utc);day=now.astimezone(api.PARIS).strftime('%Y-%m-%d')
    previous_report=read('football-market-coverage.json',{})
    report={'version':VERSION,'updatedAt':now.isoformat(),'day':day,'status':'waiting','message':'Aucun relevé complémentaire de totaux effectué.'}
    plan=candidates(now)
    if not os.environ.get('ODDS_API_KEY'):report.update(status='unconfigured',message='Clé de cotes absente.')
    elif not plan:report.update(status='no_fixtures',message='Aucune compétition de football connue avec rencontre dans les prochaines 36 heures.')
    else:
        try:
            retry_get(api.get,'/sports')
            remaining=int(float(api.credits_left or 0));limit=daily_budget(remaining,now)
            ledger=read('quote-budget.json',{})
            spent=ledger.get('spent',0) if ledger.get('day')==day else 0
            health=read('collection-health.json',{})
            try:
                if stamp(health['updatedAt']).astimezone(api.PARIS).strftime('%Y-%m-%d')==day:spent=max(spent,sum(health.get('requestCredits',{}).values()))
            except (KeyError,ValueError,TypeError):pass
            allowance=max(0,limit-spent);report.update(creditsRemaining=remaining,dailyAllowance=limit,alreadyUsedToday=spent)
            ledger={'day':day,'spent':spent,'dailyAllowance':limit,'updatedAt':now.isoformat()}
            if allowance<1:report.update(status='daily_budget',message='Budget de cotes du jour déjà utilisé. Aucune requête supplémentaire facturée.')
            else:
                # Avec 1 seul crédit : les victoires (toujours proposées), pas les totaux que Winamax ne transmet pas ici (UCL 23-25/11 : 0 ligne, crédit perdu).
                # Les buts viennent d'OddsPapi (scripts/collect_oddspapi.py).
                selected=plan[0];markets='h2h,totals' if allowance>=2 else 'h2h';expected=len(markets.split(','))
                before=remaining
                events=retry_get(api.get,'/sports/'+selected['key']+'/odds',bookmakers='winamax_fr',markets=markets,oddsFormat='decimal',commenceTimeFrom=now.strftime('%Y-%m-%dT%H:%M:%SZ'),commenceTimeTo=(now+dt.timedelta(hours=36)).strftime('%Y-%m-%dT%H:%M:%SZ'))
                cost=max(0,before-int(float(api.credits_left))) if api.credits_left is not None else expected
                ledger['spent']+=cost;save('quote-budget.json',ledger)
                matches=[m for event in events if (m:=extract(event,selected['title'],selected['key'],now))]
                publish(matches,now)
                current=read('collection-health.json',{})
                if current.get('updatedAt'):
                    try:
                        if stamp(current['updatedAt']).astimezone(api.PARIS).strftime('%Y-%m-%d')!=day:current['requestCredits']={}
                    except (ValueError,TypeError):current['requestCredits']={}
                    current.setdefault('requestCredits',{})['football_markets']=current.get('requestCredits',{}).get('football_markets',0)+cost
                    current.update(updatedAt=now.isoformat(),creditsRemaining=int(float(api.credits_left or 0)))
                    if matches:
                        native=read('sports/football.json',{})
                        rows=[r for r in current.get('sports',[]) if r.get('sport')!='football'];rows.insert(0,{'sport':'football','status':'ok','matches':len(native.get('matches',[])),'partial':True,'updatedAt':now.isoformat()})
                        current.update(sports=rows,status='partial',message='Collecte football prioritaire : victoires et totaux demandés à Winamax ; les marchés réellement transmis sont affichés.')
                    save('collection-health.json',current)
                lines=sum(g['family']=='totals' for m in matches for g in m['markets'])
                report.update(status='ok' if lines else 'provider_missing_totals',league=selected['key'],requestedMarkets=markets,matches=len(matches),totalLines=lines,creditsUsed=cost,creditsRemaining=int(float(api.credits_left or 0)),message=str(lines)+' ligne(s) de totaux de buts Winamax collectée(s).' if lines else 'Winamax ne fournit aucune paire de cotes de total de buts dans la réponse du fournisseur pour cette compétition. Aucun total inventé.')
            save('quote-budget.json',ledger)
        except Exception as exc:
            report.update(error_info(exc));report['message']='La vérification des totaux de buts a échoué. Les anciens prix ne sont pas présentés comme nouveaux.'
    if report.get('requestedMarkets'):
        report['sourceResult']={k:report[k] for k in ['status','message','updatedAt','league','requestedMarkets','matches','totalLines'] if k in report}
    elif previous_report.get('day')==day:
        result=previous_report.get('sourceResult') or {k:previous_report[k] for k in ['status','message','updatedAt','league','requestedMarkets','matches','totalLines'] if k in previous_report}
        if result.get('requestedMarkets'):report['sourceResult']=result
    save('football-market-coverage.json',report);print(report['message']);return report

if __name__=='__main__':run()
