/**
 * The blog's posts, newest first. The words live in the message catalogue under `marketing.blog.posts.<slug>`;
 * this is only what the pages need to order, date and link them.
 * ponytail: posts ship with the app. Move them to a collection with an editor when someone other than a developer
 * needs to publish.
 */
export const POSTS = [
  { slug: 'fee-collection-without-the-queue', date: '2026-10-06', minutes: 5, topic: 'fees' },
  { slug: 'attendance-parents-can-trust', date: '2026-09-22', minutes: 4, topic: 'attendance' },
  { slug: 'admissions-from-enquiry-to-first-day', date: '2026-09-08', minutes: 6, topic: 'admissions' },
  { slug: 'report-cards-without-the-last-week-rush', date: '2026-08-25', minutes: 5, topic: 'exams' },
  { slug: 'moving-a-school-off-paper-registers', date: '2026-08-11', minutes: 6, topic: 'gettingStarted' },
] as const;

export type Post = (typeof POSTS)[number];
export type PostSection = { heading: string; paragraphs: string[] };

const day = new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'UTC' });
export const postDate = (date: string) => day.format(new Date(`${date}T00:00:00Z`));
