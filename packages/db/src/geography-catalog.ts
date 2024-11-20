// HSM-LOC (SRS v2.13): Owner-selectable Islamabad/Rawalpindi localities.
// Names follow the CDA sector grid and common postal usage; no centroids or polygons are
// claimed. Societies that straddle the ICT/Rawalpindi boundary use their common postal city
// and need review against an authoritative gazetteer before public search relies on them.
export type CatalogArea = { level: 'sector' | 'area'; name: string; slug: string };
const sector = (name: string): CatalogArea => ({
  level: 'sector',
  name,
  slug: name.toLowerCase(),
});
const area = (name: string): CatalogArea => ({
  level: 'area',
  name,
  slug: name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, ''),
});
export const islamabadAreas: readonly CatalogArea[] = [
  ...['E-7', 'E-8', 'E-9', 'E-11'].map(sector),
  ...['F-5', 'F-6', 'F-7', 'F-8', 'F-10', 'F-11'].map(sector),
  ...['G-5', 'G-6', 'G-7', 'G-8', 'G-9', 'G-10', 'G-11', 'G-13', 'G-14', 'G-15'].map(sector),
  ...['H-8', 'H-9', 'H-10', 'H-11', 'H-12', 'H-13'].map(sector),
  ...['I-8', 'I-9', 'I-10', 'I-11', 'I-14', 'I-16'].map(sector),
  ...['D-12', 'B-17'].map(sector),
  ...[
    'Blue Area',
    'Bahria Enclave',
    'DHA Phase 2',
    'Gulberg Greens',
    'PWD Housing Society',
    'Bani Gala',
    'Bhara Kahu',
    'Chak Shahzad',
    'Shahzad Town',
    'Tarlai',
    'Golra Sharif',
    'Soan Garden',
    'Media Town',
    'Ghauri Town',
    'Korang Town',
    'Naval Anchorage',
    'Park Enclave',
    'Margalla Town',
    'Pakistan Town',
    'Jinnah Garden',
    'CBR Town',
    'Top City-1',
  ].map(area),
];
export const rawalpindiAreas: readonly CatalogArea[] = [
  ...[
    'Saddar',
    'Satellite Town',
    'Westridge',
    'Chaklala',
    'Chaklala Scheme III',
    'Bahria Town',
    'DHA Phase 1',
    'Raja Bazar',
    'Committee Chowk',
    'Murree Road',
    'Peshawar Road',
    'Adiala Road',
    'Gulraiz Housing Scheme',
    'Tench Bhatta',
    'Lalazar',
    'Gulistan Colony',
    'Kurri Road',
    'Morgah',
    'Dhoke Kala Khan',
    'Khayaban-e-Sir Syed',
    'Afshan Colony',
    'Shamsabad',
    'Car Chowk',
    'Pirwadhai',
    'Dhamial',
    'Misrial Road',
    'Gawalmandi',
    'Harley Street',
  ].map(area),
];
