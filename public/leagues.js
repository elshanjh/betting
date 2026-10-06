// Every competition the app loads, as [ESPN slug, name, flag, group].
// Used by the sync job (what to fetch) and by the app (league picker).
// To add one, find its slug in an ESPN URL such as
// espn.com/soccer/league/_/name/tur.1 and add a row.
// National-team competitions get odds from World Football Elo ratings when
// ESPN has no bookmaker odds for them (marked `nat: true`).
export const GROUPS = ['Top leagues', 'European cups', 'National teams', 'More Europe', 'Domestic cups', 'Rest of the world'];

export const LEAGUES = [
  ['eng.1', 'Premier League', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Top leagues'],
  ['esp.1', 'La Liga', '🇪🇸', 'Top leagues'],
  ['ita.1', 'Serie A', '🇮🇹', 'Top leagues'],
  ['ger.1', 'Bundesliga', '🇩🇪', 'Top leagues'],
  ['fra.1', 'Ligue 1', '🇫🇷', 'Top leagues'],
  ['tur.1', 'Süper Lig', '🇹🇷', 'Top leagues'],

  ['uefa.champions', 'Champions League', '🏆', 'European cups'],
  ['uefa.europa', 'Europa League', '🏆', 'European cups'],
  ['uefa.europa.conf', 'Conference League', '🏆', 'European cups'],

  ['fifa.world', 'World Cup', '🌍', 'National teams', true],
  ['uefa.euro', 'European Championship', '🇪🇺', 'National teams', true],
  ['uefa.nations', 'Nations League', '🇪🇺', 'National teams', true],
  ['fifa.worldq.uefa', 'World Cup qualifiers: Europe', '🌍', 'National teams', true],
  ['uefa.euroq', 'Euro qualifiers', '🇪🇺', 'National teams', true],
  ['fifa.friendly', 'International friendlies', '🤝', 'National teams', true],
  ['conmebol.america', 'Copa América', '🌎', 'National teams', true],
  ['fifa.worldq.conmebol', 'World Cup qualifiers: South America', '🌎', 'National teams', true],
  ['caf.nations', 'Africa Cup of Nations', '🌍', 'National teams', true],
  ['fifa.worldq.caf', 'World Cup qualifiers: Africa', '🌍', 'National teams', true],
  ['afc.asian.cup', 'Asian Cup', '🌏', 'National teams', true],
  ['fifa.worldq.afc', 'World Cup qualifiers: Asia', '🌏', 'National teams', true],
  ['fifa.worldq.concacaf', 'World Cup qualifiers: CONCACAF', '🌎', 'National teams', true],

  ['eng.2', 'Championship', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'More Europe'],
  ['ned.1', 'Eredivisie', '🇳🇱', 'More Europe'],
  ['por.1', 'Primeira Liga', '🇵🇹', 'More Europe'],
  ['bel.1', 'Pro League', '🇧🇪', 'More Europe'],
  ['sco.1', 'Scottish Premiership', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'More Europe'],
  ['gre.1', 'Greek Super League', '🇬🇷', 'More Europe'],
  ['aut.1', 'Austrian Bundesliga', '🇦🇹', 'More Europe'],
  ['den.1', 'Danish Superliga', '🇩🇰', 'More Europe'],
  ['ger.2', '2. Bundesliga', '🇩🇪', 'More Europe'],
  ['esp.2', 'La Liga 2', '🇪🇸', 'More Europe'],
  ['ita.2', 'Serie B', '🇮🇹', 'More Europe'],
  ['fra.2', 'Ligue 2', '🇫🇷', 'More Europe'],

  ['eng.fa', 'FA Cup', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Domestic cups'],
  ['eng.league_cup', 'Carabao Cup', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Domestic cups'],
  ['esp.copa_del_rey', 'Copa del Rey', '🇪🇸', 'Domestic cups'],
  ['ita.coppa_italia', 'Coppa Italia', '🇮🇹', 'Domestic cups'],
  ['ger.dfb_pokal', 'DFB-Pokal', '🇩🇪', 'Domestic cups'],
  ['fra.coupe_de_france', 'Coupe de France', '🇫🇷', 'Domestic cups'],

  ['usa.1', 'MLS', '🇺🇸', 'Rest of the world'],
  ['bra.1', 'Brasileirão', '🇧🇷', 'Rest of the world'],
  ['arg.1', 'Liga Profesional', '🇦🇷', 'Rest of the world'],
  ['mex.1', 'Liga MX', '🇲🇽', 'Rest of the world'],
  ['ksa.1', 'Saudi Pro League', '🇸🇦', 'Rest of the world'],
  ['conmebol.libertadores', 'Copa Libertadores', '🏆', 'Rest of the world'],
].map(([slug, name, flag, group, nat]) => ({ slug, name, flag, group, nat: !!nat }));

// Country of each league as a flagcdn.com code (emoji flags don't render on
// Windows and some Android phones). Competitions without one keep the emoji.
const CC = { eng: 'gb-eng', sco: 'gb-sct', esp: 'es', ita: 'it', ger: 'de', fra: 'fr', tur: 'tr', ned: 'nl', por: 'pt', bel: 'be', gre: 'gr',
  aut: 'at', den: 'dk', usa: 'us', bra: 'br', arg: 'ar', mex: 'mx', ksa: 'sa', uefa: 'eu' };
LEAGUES.forEach((l) => { l.cc = l.slug === 'uefa.nations' || l.slug === 'uefa.euro' || l.slug === 'uefa.euroq' || !l.nat ? CC[l.slug.split('.')[0]] || '' : ''; });

export const BY_SLUG = Object.fromEntries(LEAGUES.map((l) => [l.slug, l]));

// Flag image (or emoji) for a league slug.
export function flagOf(slug) {
  const l = BY_SLUG[slug];
  if (!l) return '<span class="fl-e">⚽</span>';
  return l.cc ? '<img class="fl" src="https://flagcdn.com/w40/' + l.cc + '.png" alt="" width="20" height="14" loading="lazy">' : '<span class="fl-e">' + l.flag + '</span>';
}
