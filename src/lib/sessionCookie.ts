// The __Host- prefix requires Secure, which browsers other than Chrome reject on http://localhost.
export const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-vw.session' : 'vw.session';
