import fetch from 'node-fetch';
import redis from '../redis';
import { currentUser } from './currentUser';
import _ from 'lodash';

import getUrl from '../utils/url';

// Function that returns a redis key storing a list of
// assetIds the user has access too
import { getKeyToPermittedIds } from './assets';

// Store a list of Layer models received form the server in redis
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

    // Add the id of the layer to the set of layerIds
    redis.sadd('layers', id);

    // Add the id of the layer to the set of layerIds belonging to the asset
    // it is related to.
    redis.sadd(`layers:asset:${asset}`, id);

    // Add the layer model. (Hashmap with key layer:<layerId>)
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

// Turns a layerId into a Layer model from the redis cache if found
// otherwise returns null
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

// Redis, give me Layers. Filtered by rootAsset and season ofcourse.
export async function local(user, { rootAsset, season }) {
  try {
    if (!user) {
      throw 'No user provided';
    }

    // The redis key that stores all the assetIds the user has access too
    const keyToPermittedIds = await getKeyToPermittedIds(user, 'layer');

    // Intersect that list with the list of assetIds belonging to the selected
    // season and list of decendants.
    const assetIds = await redis.sinterAsync(
      keyToPermittedIds,
      `season:${season}`,
      `decendants:${rootAsset}`,
    );

    // Clear the temporary key
    redis.del(keyToPermittedIds);

    // Iterate the final set of assetIds and determine wich sets of layerIds
    // we need. Each set links a single assetId to a list of layerIds belonging
    // to it.
    const layerIdsByAssetIdSetKeys = _.map(
      assetIds,
      id => `layers:asset:${id}`,
    );

    // Create a union of all sets of layerIds
    const layerIds = await redis.sunionAsync(...layerIdsByAssetIdSetKeys);

    // And if we end up with any layerIds then
    if (layerIds && layerIds.length) {
      try {
        // Map each layerId to a Layer model
        const list = await Promise.all(layerIds.map(getLayer));

        // Return the list of Layer models filtering out any null values
        return list.filter(layer => layer);
      } catch (error) {
        // Got nothing for ya bro.
        return [];
      }
    }
  } catch (error) {
    console.log('---------------------------------');
    console.log('Error resolving local Layers');
    console.log('---------------------------------');
    console.error(error);
    console.log('---------------------------------');
  }

  return [];
}

// Dear backend, give me Layers
export async function server({ token, rootAsset, season }) {
  // Determine the url
  const url = getUrl({
    path: 'layer/',
    queryParams: {
      rootAsset,
      season,
    },
  });

  try {
    // Make the server request
    const request = fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `${token}`,
        'Content-Type': 'application/json',
      },
    });

    const response = await request;
    const json = await response.json();

    // Store the layers in redis. store() returns a promise but because
    // we haven't prepended it with "await" the code will resume and not
    // wait for redis to finish storing the layers
    store(json);

    // Return the layers to layers()
    return json;
  } catch (error) {
    console.log(error);
  }

  return [];
}

// Returns any available Layer models from the redis cache
// or server filtered by rootAsset and season (mandatory queryParams)
export async function layers({ token, rootAsset, season }) {
  if (!token) {
    throw Error('No token provided');
  }

  if (!rootAsset || !season) {
    throw Error('No rootAsset and/or season provided');
  }

  const user = await currentUser({ token });

  // Pfffew, we got a user, token, season and rootAsset
  // Lets see if the cache has any
  const localPromise = new Promise(async resolve => {
    // Await local() for any cached Layers
    const data = await local(user, {
      token,
      rootAsset,
      season,
    });

    // Resolve localPromise if the cache returned one or more Layers
    console.log('Resolved Layers locally with:', data.length);
    if (data.length) {
      resolve(data);
    }
  });

  // And lets ask the server for the same Layers as well
  const serverPromise = new Promise(async resolve => {
    const data = await server({ token, rootAsset, season });
    console.log('Resolved Layers remotely with'), data.length;
    resolve(data);
  });

  // It's a race between redis and the server.
  // We've wrapped the server promise in another promise so that it doesn't
  // get rejected when the localPromise wins so that it can continue the
  // server call to update the cache once it resolves.
  return Promise.race([localPromise, serverPromise]);
}
