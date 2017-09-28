/**
 * Node.js API Starter Kit (https://reactstarter.com/nodejs)
 *
 * Copyright © 2016-present Kriasoft, LLC. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */

/* @flow */

import {
  GraphQLString,
  GraphQLList,
  GraphQLInt,
  GraphQLNonNull,
} from 'graphql';

import LayerType from './LayerType';
import * as Layers from '../models/layers';

export default {
  type: new GraphQLList(LayerType),
  // args: forwardConnectionArgs,
  args: {
    rootAsset: {
      type: new GraphQLNonNull(GraphQLInt),
    },
    season: {
      type: new GraphQLNonNull(GraphQLInt),
    },
    token: {
      type: GraphQLString,
    },
  },
  async resolve(root, args, context) {
    try {
      const rows = await Layers.layers({
        ...args,
        token: context.token() || args.token,
      });
      const data = rows.map(x => Object.assign(x, { __type: 'Layer' }));

      return data;
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
};
