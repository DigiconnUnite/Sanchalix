// Only same-site paths are followed, so a crafted ?next= can't send a signed-in user to another origin.
export const safeNext = (next: unknown) => (typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : '/');
