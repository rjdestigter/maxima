import fetch from 'node-fetch';
import redis from '../redis';
import { currentUser } from './currentUser';
import _ from 'lodash';

import getUrl from '../utils/url';
import { getKeyToPermittedIds } from './assets';

export async function store(data) {
  data.forEach(layer => {
    const {
      id,
      url,
      label,
      date_created,
      imagery_date,
      imagery_end_date,
      srcType,
      layerType,
      category,
      source,
      bounds,
      yield_default,
      asset,
    } = layer;

    redis.sadd('layers', id);
    redis.sadd(`layers:asset:${asset}`, id);

    redis.hmset(`layer:${id}`, [
      'id',
      id || '',
      'url',
      url || '',
      'label',
      label || '',
      'date_created',
      date_created || '',
      'imagery_date',
      imagery_date || '',
      'imagery_end_date',
      imagery_end_date || '',
      'srcType',
      srcType || '',
      'layerType',
      layerType || '',
      'category',
      category || '',
      'source',
      source || '',
      'bounds',
      bounds || '',
      'yield_default',
      yield_default ? 1 : 0,
      'asset',
      asset || '',
    ]);
  });
}

async function getLayer(layerId) {
  const {
    id,
    url,
    label,
    date_created,
    imagery_date,
    imagery_end_date,
    srcType,
    layerType,
    category,
    source,
    bounds,
    yield_default,
    asset,
  } = await redis.hgetallAsync(`layer:${layerId}`);

  return {
    id: Number(id),
    url: url || null,
    label: label || null,
    date_created: date_created || null,
    imagery_date: imagery_date || null,
    imagery_end_date: imagery_end_date || null,
    srcType: srcType || null,
    layerType: layerType || null,
    category: category || null,
    source: source || null,
    bounds: bounds || null,
    yield_default: yield_default ? true : false,
    asset: Number(asset),
  };
}

export async function local(user, { rootAsset, season }) {
  if (!user) {
    throw 'No user provided';
  }

  const keyToPermittedIds = await getKeyToPermittedIds(user);

  const assetIds = await redis.sinterAsync(
    keyToPermittedIds,
    `season:${season}`,
    `decendants:${rootAsset}`,
  );

  const layerIdsByAssetIdSetKeys = _.map(assetIds, id => `layers:asset:${id}`);
  const layerIds = await redis.sunionAsync(...layerIdsByAssetIdSetKeys);

  if (layerIds && layerIds.length) {
    try {
      const list = await Promise.all(layerIds.map(getLayer));
      return list.filter(layer => layer);
    } catch (error) {
      return [];
    }
  }

  return [];
}

export async function server({ token, rootAsset, season }) {
  const url = getUrl({
    path: 'layer/',
    queryParams: {
      rootAsset,
      season,
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

export async function layers({ token, rootAsset, season }) {
  if (!token) {
    throw Error('No token provided');
  }

  if (!rootAsset || !season) {
    throw Error('No rootAsset and/or season provided');
  }

  const user = await currentUser({ token });

  const localPromise = new Promise(async resolve => {
    const data = await local(user, {
      token,
      rootAsset,
      season,
    });

    console.log('Resolved Layers locally with:', data.length);
    if (data.length) {
      resolve(data);
    }
  });

  const serverPromise = new Promise(async resolve => {
    const data = await server({ token, rootAsset, season });
    console.log('Resolved Layers remotely with'), data.length;
    resolve(data);
  });

  return Promise.race([localPromise, serverPromise]);
}
