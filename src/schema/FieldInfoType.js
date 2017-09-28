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
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLString,
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLFloat,
} from 'graphql';

export default new GraphQLObjectType({
  name: 'FieldInfo',

  fields: {
    id: { type: new GraphQLNonNull(GraphQLInt) },
    field: { type: new GraphQLNonNull(GraphQLInt) },
    season: { type: new GraphQLNonNull(GraphQLInt) },
    LLD: { type: GraphQLString },
    previous_crop: { type: GraphQLInt },
    previous_variety: { type: GraphQLInt },
    tillage: { type: GraphQLString },
    current_crop: { type: GraphQLInt },
    current_variety: { type: GraphQLInt },
    yield_target: { type: GraphQLFloat },
    yield_target_units: { type: GraphQLInt },
    field_area_units: { type: GraphQLInt },
    acres: { type: GraphQLFloat },
    dsm_required: { type: GraphQLBoolean },
    owned: {
      type: new GraphQLEnumType({
        name: 'Owned',
        values: {
          OWNED: { value: 'OWN' },
          RENTED: { value: 'RNT' },
          UNKNOWN: { value: 'UNK' },
        },
      }),
    },
    seeding_date: { type: GraphQLString },
    seeding_depth: { type: GraphQLFloat },
    row_spacing: { type: GraphQLFloat },
    irrigated: { type: GraphQLBoolean },
    continuous_cropping: { type: GraphQLBoolean },
    straw_removed: { type: GraphQLBoolean },
    date_harvested: { type: GraphQLInt },
    date_yield_processed: { type: GraphQLInt },
  },
});
