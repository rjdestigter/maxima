/**
 * Node.js API Starter Kit (https://reactstarter.com/nodejs)
 *
 * Copyright © 2016-present Kriasoft, LLC. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */

/* @flow */

import { GraphQLString, GraphQLList, GraphQLInt } from 'graphql';

import HybridType from './HybridType';
import * as Hybrids from '../models/hybrids';

export default {
  type: new GraphQLList(HybridType),
  args: {
    crop: {
      type: GraphQLInt,
    },
    token: {
      type: GraphQLString,
    },
  },
  async resolve(root, args, context) {
    try {
      const rows = await Hybrids.hybrids({
        ...args,
        token: context.token() || args.token,
      });
      const data = rows.map(x => Object.assign(x, { __type: 'Hybrid' }));

      return data;
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
};
