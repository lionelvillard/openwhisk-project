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
import { suite, test, slow, timeout } from 'mocha-typescript';
import * as assert from 'assert';
import { env, init } from '..';
import { exec } from 'child-process-promise';
import * as fs from 'fs-extra';
import * as parser from 'properties-parser';

const rootPath = '../test/fixtures/envs';
const cacheroot = '.openwhisk';
const bxroot = `.openwhisk/.bluemix/api.ng.bluemix.net/${process.env.BLUEMIX_ORG}`;

@suite('testing environment - get')
class envget {

    static async before() {
        await fs.remove('.workdir.env');
        await fs.mkdir('.workdir.env');
        process.chdir('.workdir.env');
    }

    static async after() {
        process.chdir('..');
    }

    @test('list environments without a config file. should output an error.')
    async listAllWithoutConfig() {
        const config = init.newConfig(null);
        config.basePath = `${rootPath}/noconfig`;
        try {
            await init.init(config);
            const envs = await env.getEnvironments(config);
            assert.ok(false);
        } catch (e) {
            assert.strictEqual(e.message, 'cannot get the versions associated to the project environments: missing project name');
            assert.ok(true);
        }
    }
    @test('list environments config file does not exist. should output an error.')
    async listAllConfigDoesNotExit() {
        const config = init.newConfig('app.yml');
        config.basePath = `${rootPath}/noconfig`;
        try {
            await init.init(config);
            assert.ok(false);
        } catch (e) {
            assert.strictEqual(e.code, 'ENOENT');
            assert.ok(true);
        }
    }

    @test('list environments with config file, no app name. should output an error')
    async listAllNoName() {
        const config = init.newConfig('app.yml', null, 'dev');
        config.basePath = `${rootPath}/confignoname`;
        try {
            await init.init(config);
            const envs = await env.getEnvironments(config);
            assert.ok(false);
        } catch (e) {
            assert.strictEqual(e.message, 'cannot get the versions associated to the project environments: missing project name');
            assert.ok(true);
        }
    }

    @test('list builtin environments. should output a table, without versions')
    async listAll() {
        const config = init.newConfig('app.yml', null, 'dev');
        config.basePath = `${rootPath}/builtins`;
        await init.init(config);
        const envs = await env.getEnvironments(config);
        const local = envs.filter(env => env.policies.name === 'local');
        assert.equal(local.length, 1);
        const dev = envs.filter(env => env.policies.name === 'dev');
        assert.equal(local.length, 1);
    }

    @test('list builtin environments. should output a table, with versions')
    async listAllWithVersion() {
        const config = init.newConfig('app.yml', null, 'prod@0.0.0');
        config.basePath = `${rootPath}/builtins`;
        
        await init.init(config);
        const set = await env.setEnvironment(config);
        assert.ok(set);
        const envs = await env.getEnvironments(config);
        const prod = envs.filter(env => env.policies.name === 'prod');
        assert.equal(prod.length, 1);
        assert.equal(prod[0].versions.length, 1);

        await exec('bx account space-delete builtins-prod@0.0.0 -f');


    }
}

@suite('testing environment - set')
class envset {

    static async before() {
        await fs.remove('.workdir.env');
        await fs.mkdir('.workdir.env');
        process.chdir('.workdir.env');
    }

    static async after() {
        process.chdir('..');
    }

    @test('set environment to dev, not persisting')
    async setEnvDev() {
        process.env.BLUEMIX_HOME = `${bxroot}/builtins-dev`;

        const config = init.newConfig('app.yml', null, 'dev');
        config.basePath = `${rootPath}/builtins`;
        await init.init(config);

        const success = await env.cacheEnvironment(config);
        assert.ok(success);
        
        const wskprops = parser.read(`${bxroot}/builtins-dev/.wskprops`);
        const envprops = parser.read(`${cacheroot}/envs/.dev.wskprops`);

        assert.strictEqual(envprops.AUTH, envprops.AUTH);
        assert.strictEqual(envprops.APIGW_ACCESS_TOKEN, envprops.APIGW_ACCESS_TOKEN);
        assert.strictEqual(envprops.APIHOST, envprops.APIHOST);
        assert.ok(!await fs.pathExists('.wskprops'));

        // cleanup
        await exec(`bx login -a api.ng.bluemix.net -o ${process.env.BLUEMIX_ORG}`);
        await exec('bx iam space-delete builtins-dev -f');
        await fs.remove('.wskprops');
        delete process.env.BLUEMIX_HOME;
    }

    @test('set environment to dev, persisting')
    async setEnvDevPersisting() {
        assert.ok(!await fs.pathExists('.wskprops'));

        const config = init.newConfig('app.yml', null, 'dev');
        config.basePath = `${rootPath}/builtins`;
        await init.init(config);

        const set = await env.setEnvironment(config);
        assert.ok(set);
        assert.ok(await fs.pathExists('.wskprops'));
        const wskprops = parser.read('.wskprops');
        assert.equal(wskprops.ENVNAME, 'dev');

        // cleanup
        await fs.remove('.wskprops');
    }


    @test('change current environment from dev to prod')
    async setEnvFromDevToProd() {
        assert.ok(!await fs.pathExists('.wskprops'));

        const config = init.newConfig('app.yml', null, 'dev');
        config.basePath = `${rootPath}/builtins`;
        await init.init(config);

        const set = await env.setEnvironment(config);
        assert.ok(set);
        assert.ok(await fs.pathExists('.wskprops'));
        const wskprops = parser.read('.wskprops');
        assert.equal(wskprops.ENVNAME, 'dev');

        const configprod = init.newConfig('app.yml', null, 'prod@0.0.0');
        configprod.basePath = `${rootPath}/builtins`;
        await init.init(configprod);
        const set2 = await env.setEnvironment(configprod);
        assert.ok(set2);

        assert.ok(await fs.pathExists('.wskprops'));
        const wskpropsprod = parser.read('.wskprops');
        assert.equal(wskpropsprod.ENVNAME, 'prod');
        assert.equal(wskpropsprod.ENVVERSION, '0.0.0');

        // cleanup
        await exec('bx account space-delete builtins-prod@0.0.0 -f');
        await fs.remove('.wskprops');
    }
}
