import fetch from 'node-fetch';
import redis from '../redis';
import { currentUser } from './currentUser';

export async function store(assets) {
  assets.forEach(asset => {
    const { id, label, parent, category, shape } = asset;

    redis.sadd('assets', id);

    redis.hmset(`asset:${id}`, [
      'id',
      id || '',
      'label',
      label || '',
      'parent',
      parent || '',
      'category',
      category || '',
      'shape',
      (shape && shape.id) || '',
    ]);

    if (shape) {
      redis.sadd('shapes', shape.id);

      redis.hmset(`shape:${shape.id}`, [
        'id',
        shape.id,
        'shapeData',
        shape.shapeData,
      ]);
    }
  });
}

async function getShape(shapeId) {
  if (!shapeId) {
    return null;
  }

  const { id, asset, shapeData } = await redis.hgetallAsync(`shape:${shapeId}`);

  return {
    id: Number(id),
    asset: Number(asset),
    shapeData,
  };
}

async function getAsset(assetId) {
  const { id, label, parent, category, shape } = await redis.hgetallAsync(
    `asset:${assetId}`,
  );

  return {
    id: Number(id) || null,
    label: label || '',
    parent: Number(parent) || null,
    category,
    shape: await getShape(shape),
  };
}

export async function local() {
  const assetIds = await redis.smembersAsync('assets');

  if (assetIds) {
    try {
      const list = await Promise.all(assetIds.map(getAsset));
      return list.filter(asset => asset);
    } catch (error) {
      return [];
    }
  }

  return [];
}

export async function server({ token, rootAsset, season }) {
  try {
    const request = fetch(
      'https://dev.granduke.net/asset/?toFarmsOnly=True&shape=True',
      {
        method: 'GET',
        headers: {
          Authorization: `${token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const response = await request;
    const json = await response.json();

    store(json);

    return json;
  } catch (error) {
    console.log(error);
  }

  return [];
}

export async function assets({ token, rootAsset, season }) {
  if (!token) {
    throw 'No token provided'
    return
  }

  const user = await currentUser({ token });

  const localPromise = new Promise(async resolve => {
    const data = await local();
    if (data.length) {
      resolve(data);
    }
  });

  const serverPromise = new Promise(async resolve => {
    resolve(await server({ token, rootAsset, season }));
  });

  return Promise.race([localPromise, serverPromise]);
}
