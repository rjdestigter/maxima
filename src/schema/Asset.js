/**
 * Node.js API Starter Kit (https://reactstarter.com/nodejs)
 *
 * Copyright © 2016-present Kriasoft, LLC. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */

/* @flow */

import validator from 'validator';
import fetch from 'node-fetch';
import { GraphQLNonNull, GraphQLID, GraphQLString, GraphQLInt } from 'graphql';
import {
  fromGlobalId,
  connectionDefinitions,
  forwardConnectionArgs,
  connectionFromArraySlice,
  cursorToOffset,
  mutationWithClientMutationId,
} from 'graphql-relay';

import AssetType from './AssetType';
import ValidationError from './ValidationError';
import * as Assets from '../models/assets';

export const assets = {
  type: connectionDefinitions({
    name: 'Asset',
    nodeType: AssetType,
    connectionFields: {
      totalCount: { type: new GraphQLNonNull(GraphQLInt) },
    },
  }).connectionType,
  args: forwardConnectionArgs,
  async resolve(root, args) {
    const limit = typeof args.first === 'undefined' ? '10' : args.first;
    const offset = args.after ? cursorToOffset(args.after) + 1 : 0;

    const assets = await Assets.server();
    const data = assets.map(x => Object.assign(x, { __type: 'Asset' }));

    const totalCount = data.length;

    return {
      ...connectionFromArraySlice(data, args, {
        sliceStart: offset,
        arrayLength: totalCount,
      }),
      totalCount,
    };
  },
};

const inputFields = {
  title: {
    type: GraphQLString,
  },
  text: {
    type: GraphQLString,
  },
  url: {
    type: GraphQLString,
  },
};

const outputFields = {
  asset: {
    type: AssetType,
  },
};

function validate(input, { t, user }) {
  const errors = [];
  const data = {};

  if (!user) {
    throw new ValidationError([
      { key: '', message: t('Only authenticated users can create assets.') },
    ]);
  }

  if (typeof input.title === 'undefined' || input.title.trim() === '') {
    errors.push({
      key: 'title',
      message: t('The title field cannot be empty.'),
    });
  } else if (!validator.isLength(input.title, { min: 3, max: 80 })) {
    errors.push({
      key: 'title',
      message: t('The title field must be between 3 and 80 characters long.'),
    });
  } else {
    data.title = input.title;
  }

  if (typeof input.url !== 'undefined' && input.url.trim() !== '') {
    if (!validator.isLength(input.url, { max: 200 })) {
      errors.push({
        key: 'url',
        message: t('The URL field cannot be longer than 200 characters long.'),
      });
    } else if (!validator.isURL(input.url)) {
      errors.push({ key: 'url', message: t('The URL is invalid.') });
    } else {
      data.url = input.url;
    }
  }

  if (typeof input.text !== 'undefined' && input.text.trim() !== '') {
    if (!validator.isLength(input.text, { min: 20, max: 2000 })) {
      errors.push({
        key: 'text',
        message: t(
          'The text field must be between 20 and 2000 characters long.',
        ),
      });
    } else {
      data.text = input.text;
    }
  }

  if (data.url && data.text) {
    errors.push({
      key: '',
      message: t('Please fill either the URL or the text field but not both.'),
    });
  } else if (!input.url && !input.text) {
    errors.push({
      key: '',
      message: t('Please fill either the URL or the text field.'),
    });
  }

  data.author_id = user.id;
  return { data, errors };
}

export const createAsset = mutationWithClientMutationId({
  name: 'CreateAsset',
  inputFields,
  outputFields,
  async mutateAndGetPayload(input, context) {
    await Promise.resolve(true);
    return [];
  },
});

export const updateAsset = mutationWithClientMutationId({
  name: 'UpdateAsset',
  inputFields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    ...inputFields,
  },
  outputFields,
  async mutateAndGetPayload(input, context) {
    await Promise.resolve(true);
    return [];
  },
});
