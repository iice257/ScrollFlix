const env = import.meta.env as unknown as {
  VITE_TELEMETRY_ENABLED?: string
  VITE_TELEMETRY_ENDPOINT?: string
  VITE_APP_VERSION?: string
}

export default {
  backdropBaseUrl: 'https://image.tmdb.org/t/p/w1280',
  posterBaseUrl: 'https://image.tmdb.org/t/p/w500',
  sourceCodeUrl: 'https://github.com/iice257/ScrollFlix',
  tmdbUrl: 'https://themoviedb.org',
  tmdbFilmBaseUrl: 'https://www.themoviedb.org/movie/',
  imdbFilmBaseUrl: 'https://imdb.com/title/',
  contactEmail: '96j0o1ivb@mozmail.com',
  disableUI: false,
  telemetry: {
    enabled:
      env?.VITE_TELEMETRY_ENABLED === '1' ||
      env?.VITE_TELEMETRY_ENABLED === 'true',
    endpoint: env?.VITE_TELEMETRY_ENDPOINT || undefined,
    appVersion: env?.VITE_APP_VERSION || undefined,
  },
}
