import 'server-only';
import { type Model, type QueryFilter, Types } from 'mongoose';
import { decodeCursor, encodeCursor } from '@/lib/cursor';

type Row<T, K extends keyof T> = Pick<T, K> & { _id: Types.ObjectId };

export async function paginate<T, K extends keyof T & string>(
  model: Model<T>,
  filter: QueryFilter<T>,
  options: { sortField: K; select: K[]; limit: number; cursor?: string | undefined },
) {
  const { sortField, select, limit } = options;
  const cursor = decodeCursor(options.cursor);
  const back = cursor?.dir === 'prev';
  const op = back ? '$lt' : '$gt';
  const order = back ? -1 : 1;

  const query = model.find(filter);
  if (cursor) {
    query.and([
      {
        $or: [
          { [sortField]: { [op]: cursor.value } },
          { [sortField]: cursor.value, _id: { [op]: new Types.ObjectId(cursor.id) } },
        ],
      } as QueryFilter<T>,
    ]);
  }

  const found = await query
    .sort({ [sortField]: order, _id: order })
    .limit(limit + 1)
    .select(select)
    .lean<Row<T, K>[]>();

  const hasMore = found.length > limit;
  const rows = found.slice(0, limit);
  if (back) rows.reverse();

  const page = cursor?.page ?? 1;
  const edge = (row: Row<T, K> | undefined, dir: 'next' | 'prev', to: number) =>
    row ? encodeCursor({ value: String(row[sortField]), id: String(row._id), dir, page: to }) : null;

  return {
    rows,
    page,
    nextCursor: back || hasMore ? edge(rows.at(-1), 'next', page + 1) : null,
    prevCursor: (back ? hasMore : page > 1) ? edge(rows[0], 'prev', page - 1) : null,
  };
}
