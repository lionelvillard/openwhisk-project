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
const expr = require('../dist/libs/interpolation');


describe('Interpolation', function () {

    it('variable - custom', function () {
        const config = {
            variableSources: [
                name => ({ 'env': 'dev' }[name])
            ]
        };

        const value = expr.evaluate(config, '${vars.env}');
        assert.deepStrictEqual(value, 'dev');
    });

    it('variable - env HOME', function () {
        const config = {
            variableSources: [
                name => process.env[name]
            ]
        };

        const value = expr.evaluate(config, '${vars.HOME}');
        assert.ok(value);
    });

    it('variable - override HOME', function () {
        const config = {
            variableSources: [
                name => ({ 'HOME': '/myhome' }[name]),
                name => process.env[name]
                
            ]
        };

        const value = expr.evaluate(config, '${vars.HOME}');
        assert.deepStrictEqual(value, '/myhome');
    });

});