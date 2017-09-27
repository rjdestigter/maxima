import fetch from 'node-fetch';
import redis from '../redis';
import { currentUser } from './currentUser';

import getUrl from '../utils/url';

export async function store(data) {
  data.forEach(hybrid => {
    const { id, name, crop } = hybrid;

    redis.sadd('hybrids', id);
    redis.sadd(`crop:hybrids:${crop}`, id);

    redis.hmset(`hybrid:${id}`, [
      'id',
      id || '',
      'name',
      name || '',
      'crop',
      crop || '',
    ]);
  });
}

async function getHybrid(hybridId) {
  const { id, name, crop } = await redis.hgetallAsync(`hybrid:${hybridId}`);

  return {
    id: Number(id) || null,
    name: name || '',
    crop: Number(crop) || null,
  };
}

export async function local({ crop }) {
  let hybridIds;

  if (crop) {
    hybridIds = await redis.smembersAsync(`crop:hybrids:${crop}`);
  } else {
    hybridIds = await redis.smembersAsync('hybrids');
  }

  if (hybridIds) {
    try {
      const list = await Promise.all(hybridIds.map(getHybrid));
      return list.filter(hybrid => hybrid);
    } catch (error) {
      return [];
    }
  }

  return [];
}

export async function server({ token, crop }) {
  const url = getUrl({
    path: 'crop/variety/',
    queryParams: {
      crop,
    },
  });

  try {
    const request = fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `${token}`,
        'Content-Type': 'application/json',
      },
    });

    const response = await request;
    const json = await response.json();

    store(json);

    return json;
  } catch (error) {
    console.log(error);
  }

  return [];
}

export async function hybrids({ token, crop }) {
  if (!token) {
    throw Error('No token provided');
  }

  await currentUser({ token });

  const localPromise = new Promise(async resolve => {
    const data = await local({
      token,
      crop,
    });
    if (data.length) {
      resolve(data);
    }
  });

  const serverPromise = new Promise(async resolve => {
    resolve(await server({ token, crop }));
  });

  return Promise.race([localPromise, serverPromise]);
}
