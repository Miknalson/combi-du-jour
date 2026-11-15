/* Read-only presentation of the frozen ticket used by the paper journal and alerts. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TicketReference = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var labels = {football:'Football',basket:'Basket',tennis:'Tennis',rugby_xv:'Rugby à XV',rugby_xiii:'Rugby à XIII',football_us:'Football américain',hockey:'Hockey',volley:'Volley',mixed:'Mix foot / basket / tennis'};
  function records(journal) {
    return journal && Array.isArray(journal.records) ? journal.records.filter(function (r) {
      return r && r.mode === 'paper' && typeof r.id === 'string' && ['algo', 'safe'].includes(r.method) && Array.isArray(r.legs);
    }) : [];
  }
  function find(journal, id) { return records(journal).find(function (r) { return r.id === id; }) || null; }
  function forDay(journal, day, method, sport) {
    return records(journal).find(function (r) { return r.day === day && r.method === method && r.sport === sport; }) || null;
  }
  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
  }
  function price(value) { return Number.isFinite(value) ? value.toFixed(2).replace('.', ',') : '—'; }
  function stamp(value) {
    return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('fr-FR', {timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : 'non renseigné';
  }
  function status(record, now) {
    if (record.status === 'no_pick' || !record.legs.length) return 'no_pick';
    if (['won', 'lost', 'void'].includes(record.status)) return record.status;
    if (record.legs.some(function (l) { return !Number.isFinite(Date.parse(l.kickoff)) || Date.parse(l.kickoff) <= now; })) return 'started';
    if (record.legs.some(function (l) { var age = now - Date.parse(l.asOf); return !Number.isFinite(age) || age < 0 || age > 3600000; })) return 'stale';
    return 'upcoming';
  }
  function copyText(record) {
    return record.method.toUpperCase() + ' · ' + (labels[record.sport] || record.sport) + ' · ' + record.day +
      '\nTicket figé le ' + stamp(record.createdAt) + ' (heure de Paris)\n' +
      record.legs.map(function (l) { return l.home + ' – ' + l.away + ' : ' + l.label + ' · cote relevée ' + price(l.o); }).join('\n') +
      '\nCote relevée du ticket : ' + price(record.odds) + '. Mise du test : ' + record.simulatedStake + ' € fictifs.' +
      '\nÀ revérifier sur Winamax. Aucun pari placé par Combiné du Jour.';
  }
  function render(record, options) {
    options = options || {};
    if (!record) return '<article class="model-card reference-ticket"><h2>' + (options.unavailable ? 'Ticket de référence indisponible' : 'Aucun Algo enregistré pour ce jour') + '</h2><p>' +
      (options.unavailable ? 'Le journal de référence n’a pas pu être chargé. Actualise la page pour retrouver le ticket utilisé par les alertes.' : options.requestedId ? 'Cette référence est introuvable dans le journal. Aucun autre ticket ne la remplace.' : 'La collecte n’a pas encore enregistré de ticket Algo pour cette journée. Aucun scénario de simulation ne le remplace.') + '</p></article>';
    var state = status(record, options.now === undefined ? Date.now() : options.now);
    var title = record.method.toUpperCase() + ' · ' + (labels[record.sport] || record.sport);
    var head = '<article class="model-card reference-ticket" data-reference-id="' + escape(record.id) + '"><span class="eyebrow">Ticket de référence · ' + escape(record.day || '') + '</span><h2>' + escape(title) + '</h2><p>Figé le ' + escape(stamp(record.createdAt)) + ', heure de Paris. Les alertes et le journal utilisent ce même ticket enregistré ; tes réglages de simulation ne le modifient pas.</p>';
    if (state === 'no_pick') return head + '<p>Aucun ticket admissible au moment de l’enregistrement. Aucune mise fictive ni alerte pour cette catégorie. Le résultat « aucun ticket » reste figé pour cette journée.</p></article>';
    var notes = {upcoming:'Vérifie les sélections, les marchés exacts et la cote actuelle sur Winamax.',stale:'Relevé de plus d’une heure ou horodatage indisponible : les cotes ne sont plus à jour. Le ticket de référence reste inchangé.',started:'Une rencontre a commencé : ce ticket reste visible pour le suivi, mais ce n’est plus une proposition à jouer.',won:'Ticket réglé : gagné.',lost:'Ticket réglé : perdu.',void:'Ticket réglé : annulé.'};
    return head + '<ol class="reference-legs">' + record.legs.map(function (l) {
      return '<li><strong>' + escape(l.label) + '</strong><br>' + escape(l.home + ' – ' + l.away) + ' · cote relevée ' + price(l.o) +
        '<br><small>' + escape(l.league || '') + ' · début le ' + escape(stamp(l.kickoff)) + ' · relevé le ' + escape(stamp(l.asOf)) + ' (Paris)</small></li>';
    }).join('') + '</ol><p>Cote relevée du ticket : <strong>' + price(record.odds) + '</strong>' +
      (Number.isFinite(record.probability) ? ' · probabilité indicative : ' + (record.probability * 100).toFixed(1).replace('.', ',') + ' %' : '') +
      ' · mise du test : <strong>' + escape(record.simulatedStake) + ' € fictifs</strong>.</p><p class="status">' + escape(notes[state]) + '</p>' +
      '<div class="reference-actions"><button type="button" class="btn ghost" data-reference-copy="' + escape(record.id) + '">Copier les sélections</button>' +
      '<a class="btn" href="https://www.winamax.fr/paris-sportifs" target="_blank" rel="noopener noreferrer">Ouvrir Winamax</a>' +
      (options.linkToAlgo && record.method === 'algo' ? '<a href="./?ticket=' + encodeURIComponent(record.id) + '">Retrouver ce ticket dans Algo</a>' : '') + '</div>' +
      '<p class="status">Aucun pari placé. Tu reconstruis le ticket et choisis ta mise sur Winamax. Ouvrir ce lien ne remplit ni ne valide un pari.</p></article>';
  }
  function bindCopy(container, lookup) {
    container.addEventListener('click', async function (event) {
      var button = event.target.closest('[data-reference-copy]');
      if (!button) return;
      var record = lookup(button.dataset.referenceCopy);
      if (!record) return;
      try { await navigator.clipboard.writeText(copyText(record)); button.textContent = 'Sélections copiées'; }
      catch (error) { button.textContent = 'Copie indisponible sur ce navigateur'; }
    });
  }
  return {records:records, find:find, forDay:forDay, status:status, copyText:copyText, render:render, bindCopy:bindCopy};
});
