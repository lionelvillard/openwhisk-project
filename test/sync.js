/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const assert = require('assert');
const utils = require('./helpers/utils');
const wskd = require('./..');

describe('testing sync', function () {
    const ctx = {};

    before(utils.before(ctx));
    after(utils.after(ctx));

    function assertNamespaceEmpty(json) {
        assert.equal(json.packages.length, 0);
        assert.equal(json.actions.length, 0);
        assert.equal(json.rules.length, 0);
        assert.equal(json.triggers.length, 0);
        assert.equal(json.apis.length, 0);
    }

    it.skip('empty files directory', async function () {
    });

});