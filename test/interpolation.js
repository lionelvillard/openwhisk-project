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
const interpolation = require('../dist/libs/interpolation');
const log4j = require('log4js');
const tasks = require('./../dist/libs/coordinator');

describe('Interpolation', function () {

    it('empty string expression ', async function () {
        const config = {
            logger: log4j.getLogger()
        }
        const value = interpolation.evaluate(config, '');
        assert.deepStrictEqual(value, '');
    });

    it('constant expression string', async function () {
        const config = {
            logger: log4j.getLogger()
        }
        const value = interpolation.evaluate(config, 'a string');
        assert.deepStrictEqual(value, 'a string');
    });

    it('variable - custom', function () {
        const config = {
            variableSources: [
                name => ({ 'env': 'dev' }[name])
            ],
            logger: log4j.getLogger()
        };

        const value = interpolation.evaluate(config, '${vars.env}');
        assert.deepStrictEqual(value, 'dev');
    });

    it('variable - env HOME', function () {
        const config = {
            variableSources: [
                name => process.env[name]
            ],
            logger: log4j.getLogger()
        };

        const value = interpolation.evaluate(config, '${vars.HOME}');
        assert.ok(value);
    });

    it('variable - override HOME', function () {
        const config = {
            variableSources: [
                name => ({ 'HOME': '/myhome' }[name]),
                name => process.env[name]

            ],
            logger: log4j.getLogger()
        };

        const value = interpolation.evaluate(config, '${vars.HOME}');
        assert.deepStrictEqual(value, '/myhome');
    });


    it('self string expression, alone', async function () {
        const config = {
            manifest: {
                name: 'myname'
            },
            logger: log4j.getLogger()
        }
        interpolation.setProxy(config, 'manifest');
        const value = interpolation.evaluate(config, '${self.name}');
        assert.deepStrictEqual(value, 'myname');
    });


    it('self object expression, alone', async function () {
        const config = {
            manifest: {
                name: { first: 'myname', second: 'mysecondname' }
            },
            logger: log4j.getLogger()
        }
        interpolation.setProxy(config, 'manifest');
        const value = interpolation.evaluate(config, '${self.name}');
        assert.deepStrictEqual(value, { first: 'myname', second: 'mysecondname' });
    });

    it('self string expression and constant strings', async function () {
        const config = {
            manifest: {
                name: 'myname'
            },
            logger: log4j.getLogger()
        }
        interpolation.reset();
        interpolation.setProxy(config, 'manifest');

        const value = interpolation.evaluate(config, 'My name is ${self.name}');
        assert.deepStrictEqual(value, 'My name is myname');
    });

    it('project configuration with promises at the top-level, intermediate results', async function () {
        const config = {
            manifest: {
                name: tasks.task(resolve => resolve('myname'))
            },
            logger: log4j.getLogger()
        }
        interpolation.reset();
        interpolation.setProxy(config, 'manifest', true);

        const value = interpolation.evaluate(config, '${self.name}');
        assert.deepStrictEqual(value.expr, '${proxy._0.name}');

        // give control back to node.
        await new Promise(resolve => setTimeout(() => {
            const value2 = interpolation.evaluate(config, value.expr);
            assert.deepStrictEqual(value2, 'myname');
            resolve();
        }, 1));

    });

    it('project configuration with nested promises, intermediate result', async function () {
        const config = {
            manifest: {
                prop1: tasks.task(resolve => setTimeout(() => resolve({
                    prop2: tasks.task(resolve => resolve('value'))
                }), 100))
            },
            logger: log4j.getLogger()
        }
        interpolation.reset();
        interpolation.setProxy(config, 'manifest');

        const value = interpolation.evaluate(config, '${self.prop1}');
        assert.deepStrictEqual(value.expr, '${proxy._0.prop1}');

        // give control back to node
        await new Promise(resolve => setTimeout(() => {
            const value2 = interpolation.evaluate(config, value.expr);
            assert.ok(value2.prop2);
            resolve();
        }, 200)); // 200 > 100

    });

    it('combining string expression and promises', async function () {
        const config = {
            manifest: {
                name: 'myname',
                service: tasks.task(resolve => setTimeout(() => resolve('redis'), 100))
            },
            logger: log4j.getLogger()
        }
        interpolation.reset();
        interpolation.setProxy(config, 'manifest');

        const value = await interpolation.fullyEvaluate(config, 'My name is ${self.name} with ${self.service}');
        assert.deepStrictEqual(value, 'My name is myname with redis');
    });


    it('should handle error when property does not exist', async function () {
        const config = {
            manifest: {
                name: tasks.task(resolve => resolve('myname'))
            },
            logger: log4j.getLogger()
        }
        interpolation.reset();
        interpolation.setProxy(config, 'manifest', true);

        const value = await interpolation.fullyEvaluate(config, '${self.doesnotexist}');
        assert.ok(!value);
    });

    it('should wait for async value to equal redis', async function () {
        const config = {
            manifest: {
                service: tasks.task(resolve => setTimeout(() => resolve('redis'), 100))
            },
            logger: log4j.getLogger()
        }
        interpolation.reset();
        interpolation.setProxy(config, 'manifest');

        const value = await interpolation.blockUntil(config, 'self', 'service', 'redis');
        assert.deepStrictEqual(value, 'redis');
    });

    it('should wait for async value to equal redis after being noredis', async function () {
        const config = {
            manifest: {
                service: tasks.task(resolve => setTimeout(() => resolve('noredis'), 100))
            },
            logger: log4j.getLogger()
        }
        interpolation.reset();
        interpolation.setProxy(config, 'manifest');

        setTimeout(() => config.manifest.service = 'redis', 150);

        const value = await interpolation.blockUntil(config, 'self', 'service', 'redis');
        assert.deepStrictEqual(value, 'redis');
    });

});