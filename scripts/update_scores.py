#!/usr/bin/env python3
"""Refresh only known football fixtures with verified full-time scores; no odds API credits."""
import argparse
import datetime as dt
import json
from pathlib import Path
import re
import ssl
import unicodedata
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1] / 'data'
LEAGUES = {'PL':'eng.1','CHA':'eng.2','LIGA':'esp.1','LIGA2':'esp.2','SA':'ita.1','BL':'ger.1','BL2':'ger.2','L1':'fra.1','L2':'fra.2','POR':'por.1','POR2':'por.2','ERE':'ned.1','BEL':'bel.1','UCL':'uefa.champions','UEL':'uefa.europa','UECL':'uefa.europa.conf','UNL':'uefa.nations','EURO':'uefa.euro','EUROQ':'uefa.euroq','UWCL':'uefa.wchampions','TUR':'tur.1','DEN':'den.1','SWE':'swe.1','POL':'pol.1','ROU':'rou.1','RUS':'rus.1','SRB':'srb.1','UKR':'ukr.1','IRL':'irl.1'}

def team(value, league):
    value = str(value).translate(str.maketrans({'ø':'o','Ø':'O','ł':'l','Ł':'L','ß':'ss','æ':'ae','Æ':'Ae','œ':'oe','Œ':'Oe'}))
    value = unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode().lower()
    tokens = re.findall(r'[a-z0-9]+',value)
    if league == 'UWCL':
        tokens = [t for t in tokens if t not in {'women','w','fc','sl','as'}]
        value = ''.join(tokens)
        # Explicit women's club aliases across the two feeds; never fuzzy-match teams.
        aliases = {'hbkoge':'koge','servette':'servettegeneve','servettefccf':'servettegeneve','servettechenois':'servettegeneve','servettechenoisfeminin':'servettegeneve'}
        return aliases.get(value,value)
    return ''.join(tokens)

def final_event(event):
    """Football scores including extra time or penalties are not 90-minute results."""
    if not isinstance(event,dict):return None
    competitions=event.get('competitions',[])
    if not isinstance(competitions,list) or len(competitions)!=1 or not isinstance(competitions[0],dict):return None
    match=competitions[0]
    status=match.get('status') or event.get('status',{})
    if not isinstance(status,dict):return None
    kind=status.get('type',{})
    if not isinstance(kind,dict):return None
    if kind.get('completed') is not True or kind.get('name') not in ('STATUS_FULL_TIME','STATUS_FINAL') or status.get('period')!=2:return None
    competitors=match.get('competitors',[])
    if not isinstance(competitors,list) or any(not isinstance(c,dict) or not isinstance(c.get('team',{}),dict) for c in competitors):return None
    sides={c.get('homeAway'):c for c in competitors}
    if set(sides)!={'home','away'}:return None
    scores=[]
    for side in ('home','away'):
        score=sides[side].get('score')
        if isinstance(score,dict):score=score.get('value')
        if isinstance(score,bool) or not re.fullmatch(r'\d+',str(score)):return None
        scores.append(int(score))
    names={side:[sides[side].get('team',{}).get(k,'') for k in ('displayName','shortDisplayName','name')] for side in ('home','away')}
    kickoff=match.get('date') or event.get('date')
    try:dt.datetime.fromisoformat(kickoff.replace('Z','+00:00'))
    except (ValueError,TypeError,AttributeError):return None
    return {'kickoff':kickoff,'names':names,'score':str(scores[0])+'-'+str(scores[1])}

def matching_final(match, events):
    found=[]
    for event in events:
        result=final_event(event)
        if not result:continue
        try:
            if dt.datetime.fromisoformat(result['kickoff'].replace('Z','+00:00'))!=dt.datetime.fromisoformat(match['kickoff'].replace('Z','+00:00')):continue
        except (ValueError,KeyError,TypeError,AttributeError):continue
        league=match.get('league','')
        if all(team(match.get(side,''),league) in {team(n,league) for n in result['names'][key] if n} for side,key in [('home','home'),('away','away')]):found.append(result)
    return found[0] if len(found)==1 else None

def fetch(league,day):
    url='https://site.api.espn.com/apis/site/v2/sports/soccer/'+league+'/scoreboard?dates='+day.replace('-','')+'&limit=100'
    request=urllib.request.Request(url,headers={'User-Agent':'Combi-du-jour results updater','Accept':'application/json'})
    with urllib.request.urlopen(request,timeout=20,context=ssl.create_default_context()) as response:return json.load(response)

def update(now=None,max_requests=8):
    now=now or dt.datetime.now(dt.timezone.utc)
    plans={}
    docs={}
    for file in sorted((ROOT/'days').glob('????-??-??.json')):
        try:
            day=dt.date.fromisoformat(file.stem)
            if not 0<=(now.date()-day).days<=7:continue
            doc=json.loads(file.read_text());docs[file]=doc
            for match in doc.get('matches',[]):
                league=match.get('league')
                kickoff=dt.datetime.fromisoformat(match['kickoff'].replace('Z','+00:00'))
                if match.get('score') or league not in LEAGUES or kickoff>now-dt.timedelta(hours=2):continue
                plans.setdefault((file.stem,league),[]).append((file,match))
        except (OSError,ValueError,KeyError,TypeError):continue
    updated=0;queried=0;failures=[];changed=set();unmatched=0
    for (day,league),matches in list(plans.items())[:max_requests]:
        queried+=1
        try:
            payload=fetch(LEAGUES[league],day)
            events=payload.get('events',[])
            if not isinstance(events,list):raise ValueError('Invalid results')
        except Exception as exc:
            failures.append({'day':day,'league':league,'type':'http' if isinstance(exc,urllib.error.HTTPError) else 'network_or_response','httpStatus':exc.code if isinstance(exc,urllib.error.HTTPError) else None})
            continue
        for file,match in matches:
            result=matching_final(match,events)
            if not result:unmatched+=1;continue
            match.update(score=result['score'],scoreStatus='final',scoreScope='regulation',completed=True,scoreSource='ESPN',scoreUpdatedAt=now.isoformat())
            updated+=1;changed.add(file)
    for file in changed:
        docs[file]['scoresUpdatedAt']=now.isoformat()
        file.write_text(json.dumps(docs[file],ensure_ascii=False,indent=1)+'\n')
    pending=sum(len(v) for v in plans.values())-updated
    state='unavailable' if failures and len(failures)==queried else 'partial' if pending or failures else 'ok'
    report={'updatedAt':now.isoformat(),'status':state,'source':'ESPN public football scoreboards','queried':queried,'updatedMatches':updated,'pendingMatches':pending,'unmatchedFixtures':unmatched,'failures':failures,'message':str(updated)+' score(s) final(aux) de football récupéré(s).'+(' Certains résultats restent à vérifier : score absent, identité différente ou fin du temps réglementaire non confirmée.' if pending else '')}
    (ROOT/'scores-health.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(report['message'])
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--max-requests',type=int,default=8);args=parser.parse_args();result=update(max_requests=max(0,min(args.max_requests,8)));raise SystemExit(1 if result['status']=='unavailable' else 0)
