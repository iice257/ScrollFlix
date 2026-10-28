// Origin and style groups for the Filters page: Anime, Cartoons, Nollywood,
// Korean, South African and so on. They come from what the catalogue already
// carries for every film (its genres and its primary country), so they need no
// new data. A group is a hand-made list of countries, optionally with the
// Animation genre; the lists use TMDB's country names.
import type { TestMovie } from './catalog-loader'

export type OriginId =
  | 'anime'
  | 'cartoons'
  | 'hollywood'
  | 'british'
  | 'french'
  | 'european'
  | 'indian'
  | 'korean'
  | 'japanese'
  | 'chinese'
  | 'latinAmerican'
  | 'middleEastern'
  | 'african'
  | 'nollywood'
  | 'southAfrican'

export type OriginGroup = {
  id: OriginId
  label: string
  // The chip's tooltip.
  hint: string
  test: (movie: TestMovie) => boolean
}

const AFRICAN = new Set([
  'Egypt',
  'South Africa',
  'Nigeria',
  'Algeria',
  'Morocco',
  'Senegal',
  'Burkina Faso',
  'Congo',
  'Kenya',
  "Cote D'Ivoire",
  'Tunisia',
  'Ethiopia',
  'Uganda',
  'Angola',
  'Cameroon',
  'Chad',
  'Ghana',
  'Mali',
  'Namibia',
  'Benin',
  'Botswana',
  'Liberia',
  'Libyan Arab Jamahiriya',
  'Mauritius',
  'Mozambique',
  'Rwanda',
  'Equatorial Guinea',
  'Guinea-Bissau',
  'Malawi',
  'Mauritania',
  'Niger',
  'Swaziland',
  'Tanzania',
  'Zimbabwe',
])

const LATIN_AMERICAN = new Set([
  'Mexico',
  'Brazil',
  'Argentina',
  'Chile',
  'Colombia',
  'Peru',
  'Cuba',
  'Dominican Republic',
  'Venezuela',
  'Puerto Rico',
  'Bolivia',
  'Uruguay',
  'Ecuador',
  'Costa Rica',
  'Panama',
  'Guatemala',
  'Paraguay',
  'Honduras',
  'Nicaragua',
  'El Salvador',
])

const MIDDLE_EASTERN = new Set([
  'Turkey',
  'Iran',
  'Israel',
  'Lebanon',
  'United Arab Emirates',
  'Saudi Arabia',
  'Jordan',
  'Qatar',
  'Syrian Arab Republic',
  'Iraq',
  'Palestinian Territory',
  'Kuwait',
  'Yemen',
])

const EUROPEAN = new Set([
  'France',
  'United Kingdom',
  'Italy',
  'Germany',
  'Spain',
  'Belgium',
  'Russia',
  'Soviet Union',
  'Denmark',
  'Poland',
  'Sweden',
  'Netherlands',
  'Finland',
  'Greece',
  'Austria',
  'Czech Republic',
  'Czechoslovakia',
  'Norway',
  'Ireland',
  'Northern Ireland',
  'Romania',
  'Hungary',
  'Switzerland',
  'Portugal',
  'Yugoslavia',
  'Bulgaria',
  'Ukraine',
  'Croatia',
  'Estonia',
  'Iceland',
  'Serbia',
  'Serbia and Montenegro',
  'Montenegro',
  'East Germany',
  'Luxembourg',
  'Lithuania',
  'Bosnia and Herzegovina',
  'Latvia',
  'Slovenia',
  'Slovakia',
  'Macedonia',
  'Cyprus',
  'Albania',
  'Belarus',
  'Moldova',
  'Malta',
  'Kosovo',
  'Liechtenstein',
  'Andorra',
  'Monaco',
  'Gibraltar',
  'Faeroe Islands',
])

const CHINESE = new Set(['China', 'Hong Kong', 'Taiwan', 'Macao'])

const isAnimation = (movie: TestMovie) => movie.genres.includes('Animation')
const from = (movie: TestMovie, set: ReadonlySet<string>) =>
  set.has(movie.countries)

export const ORIGIN_GROUPS: OriginGroup[] = [
  {
    id: 'anime',
    label: 'Anime',
    hint: 'Animation made in Japan',
    test: (movie) => isAnimation(movie) && movie.countries === 'Japan',
  },
  {
    id: 'cartoons',
    label: 'Cartoons',
    hint: 'Animation from everywhere but Japan',
    test: (movie) => isAnimation(movie) && movie.countries !== 'Japan',
  },
  {
    id: 'hollywood',
    label: 'Hollywood',
    hint: 'Made in the United States',
    test: (movie) => movie.countries === 'United States of America',
  },
  {
    id: 'british',
    label: 'British',
    hint: 'Made in the United Kingdom',
    test: (movie) => movie.countries === 'United Kingdom',
  },
  {
    id: 'french',
    label: 'French',
    hint: 'Made in France',
    test: (movie) => movie.countries === 'France',
  },
  {
    id: 'european',
    label: 'European',
    hint: 'Made anywhere in Europe',
    test: (movie) => from(movie, EUROPEAN),
  },
  {
    id: 'indian',
    label: 'Indian',
    hint: 'Made in India',
    test: (movie) => movie.countries === 'India',
  },
  {
    id: 'korean',
    label: 'Korean',
    hint: 'Made in South Korea',
    test: (movie) => movie.countries === 'South Korea',
  },
  {
    id: 'japanese',
    label: 'Japanese',
    hint: 'Made in Japan',
    test: (movie) => movie.countries === 'Japan',
  },
  {
    id: 'chinese',
    label: 'Chinese',
    hint: 'Made in China, Hong Kong, Taiwan or Macao',
    test: (movie) => from(movie, CHINESE),
  },
  {
    id: 'latinAmerican',
    label: 'Latin American',
    hint: 'Made in Latin America',
    test: (movie) => from(movie, LATIN_AMERICAN),
  },
  {
    id: 'middleEastern',
    label: 'Middle Eastern',
    hint: 'Made in the Middle East, Turkey and Iran included',
    test: (movie) => from(movie, MIDDLE_EASTERN),
  },
  {
    id: 'african',
    label: 'African',
    hint: 'Made anywhere in Africa',
    test: (movie) => from(movie, AFRICAN),
  },
  {
    id: 'nollywood',
    label: 'Nollywood',
    hint: 'Made in Nigeria',
    test: (movie) => movie.countries === 'Nigeria',
  },
  {
    id: 'southAfrican',
    label: 'South African',
    hint: 'Made in South Africa',
    test: (movie) => movie.countries === 'South Africa',
  },
]

// Selected groups combine with "or": a film in any of them stays.
export const filterMoviesByOrigins = (
  movies: TestMovie[],
  selected: readonly OriginId[],
) => {
  if (!selected.length) return movies
  const tests = ORIGIN_GROUPS.filter((group) => selected.includes(group.id))
  return movies.filter((movie) => tests.some((group) => group.test(movie)))
}

// How many films each group holds, in one pass.
export const countOrigins = (movies: readonly TestMovie[]) => {
  const counts = new Map<OriginId, number>()
  for (const movie of movies) {
    for (const group of ORIGIN_GROUPS) {
      if (group.test(movie))
        counts.set(group.id, (counts.get(group.id) ?? 0) + 1)
    }
  }
  return counts
}
