/* Modèle pur, partagé avec les tests. Probabilité élevée ≠ rendement positif. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CombiModel=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function probabilities(odds,parameters){
    if(!Array.isArray(odds)||odds.length!==3||odds.some(o=>!Number.isFinite(o)||o<=1))return null;
    const inv=odds.map(o=>1/o);let lo=.05,hi=8;
    for(let i=0;i<70;i++){const k=(lo+hi)/2;if(inv.reduce((s,x)=>s+x**k,0)>1)lo=k;else hi=k}
    const raw=inv.map(x=>x**((lo+hi)/2)),total=raw.reduce((s,x)=>s+x,0),p=raw.map(x=>x/total);
    const par=parameters||{},temperature=par.temperature??1,home=par.homeBias??0,draw=par.drawBias??0;
    if(!Number.isFinite(temperature)||temperature<=0||![home,draw].every(Number.isFinite))return null;
    const logits=p.map((x,i)=>Math.log(Math.max(1e-12,x))/temperature+[home,draw,0][i]);
    const max=Math.max(...logits),q=logits.map(x=>Math.exp(x-max)),sum=q.reduce((s,x)=>s+x,0);
    return q.map(x=>x/sum);
  }
  function fresh(value,now,maxMinutes,kickoff){
    const timestamp=Date.parse(value);
    return Number.isFinite(timestamp)&&timestamp<=now&&now-timestamp<=maxMinutes*60000&&timestamp<kickoff;
  }
  function forecast(match,report,now=Date.now()){
    if(!report||report.schemaVersion!==1||!report.parameters||!report.rule)return [];
    const p=probabilities([match.o1,match.oX,match.o2],report.parameters);if(!p)return [];
    const reference=match.sharp?.bookKey==='pinnacle'?probabilities([match.sharp.o1,match.sharp.oX,match.sharp.o2],report.parameters):null;
    const rule=report.rule,kickoff=Date.parse(match.kickoff),own=match.mine||{};
    const common=[];
    if(!Number.isFinite(kickoff)||kickoff<=now||match.score)common.push('Match commencé ou terminé');
    if(!report.dataset.files.some(f=>f.league===match.league))common.push('Championnat hors étude');
    if(!(match.books>=5))common.push('Moins de 5 sources de référence');
    if(!fresh(match.referenceAt,now,rule.quoteMaxAgeMinutes,kickoff))common.push('Référence non horodatée ou ancienne');
    if(own.bookKey!==rule.requireBook)common.push('Cote Winamax France non vérifiée');
    if(!fresh(own.asOf,now,rule.quoteMaxAgeMinutes,kickoff))common.push('Cote jouable non horodatée ou ancienne');
    const quotes=[own.o1,own.oX,own.o2],codes=['1','X','2'],labels=['Victoire '+match.home,'Match nul','Victoire '+match.away];
    return p.map((probability,index)=>{
      const reasons=common.slice(),price=quotes[index],guarded=Math.max(0,Math.min(probability,reference?reference[index]:probability)-rule.probabilityHaircut);
      const edge=Number.isFinite(price)?guarded*price-1:null;
      if(!Number.isFinite(price)||price<rule.minOdds||price>rule.maxOdds)reasons.push('Cote réelle hors fourchette ou absente');
      if(probability<rule.minimumProbability)reasons.push('Probabilité sous le seuil');
      if(edge===null||edge<rule.minimumEdge)reasons.push('Avantage de prix insuffisant');
      return {matchId:match.id,match,code:codes[index],label:labels[index],probability,guardedProbability:guarded,
        odds:Number.isFinite(price)?price:null,edge,minPrice:(1+rule.minimumEdge)/Math.max(guarded,1e-9),reasons,eligible:reasons.length===0};
    });
  }
  function assess(matches,report,now=Date.now()){
    if(!report||report.schemaVersion!==1||!report.rule||!report.dataset||!Array.isArray(report.dataset.files))return {status:'unavailable',picks:[],observations:[]};
    const observations=matches.flatMap(m=>forecast(m,report,now)).sort((a,b)=>(b.edge??-Infinity)-(a.edge??-Infinity));
    // Le rapport d’étude n’autorise pas de mise sans validation sur des prix exécutables.
    const evidence=report.rules?.value_single;
    const authorised=report.productionEnabled===true&&evidence?.profitableEvidence===true&&
      evidence.tickets>=report.rule.minimumTestBets&&evidence.roi95?.[0]>0&&report.validatedBook===report.rule.requireBook;
    if(!authorised)return {status:'observation',picks:[],observations};
    const picks=observations.filter(c=>c.eligible).slice(0,Math.min(1,report.rule.maxBetsPerDay));
    return {status:picks.length?'candidate':'no-bet',picks,observations};
  }
  return {probabilities,fresh,forecast,assess};
});
