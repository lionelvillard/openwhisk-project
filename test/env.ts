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
import { suite, test, slow, timeout, skip } from 'mocha-typescript';
import * as assert from 'assert';
import { env, init, bx, deploy, undeploy } from '..';
import { exec } from 'child-process-promise';
import * as fs from 'fs-extra';
import * as parser from 'properties-parser';
import { config } from 'bluebird';

const rootPath = '../../test/fixtures/envs';
const cacheroot = '.openwhisk';
const bxroot = `.openwhisk/.bluemix/api.ng.bluemix.net/${process.env.BLUEMIX_ORG}`;
const projectfile = process.env.LOCALWSK ? 'project-ci.yml' : 'project.yml';
const projectname = process.env.LOCALWSK ? 'builtins-ci' : 'builtins';

@suite('env - ')
class Envget {

    static async before() {
        await fs.remove('.workdir/.env');
        await fs.mkdirs('.workdir/.env');
        process.chdir('.workdir/.env');
    }

    static async after() {
        process.chdir('../..');
        await fs.remove('.workdir/.env');
    }

    @test('list environments without a config file. should output an error.')
    async listAllWithoutConfig() {
        if (process.env.LOCALWSK === 'true')
            return skip(this);

        const config = init.newConfig(null, process.env.LOGGER_LEVEL);
        config.basePath = `${rootPath}/noconfig`;
        try {
            await init.init(config);
            const envs = await env.getVersionedEnvironments(config);
            assert.ok(false);
        } catch (e) {
            assert.strictEqual(e.message, 'cannot get project versions: missing project name (missing configuration file?)');
            assert.ok(true);
        }
    }
    @test('list environments config file does not exist. should output an error.')
    async listAllConfigDoesNotExit() {
        if (process.env.LOCALWSK === 'true')
            return skip(this);

        const config = init.newConfig('project.yml', process.env.LOGGER_LEVEL);
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
        if (process.env.LOCALWSK === 'true')
            return skip(this);

        const config = init.newConfig('project.yml', process.env.LOGGER_LEVEL, 'dev');
        config.basePath = `${rootPath}/confignoname`;
        try {
            await init.init(config);
            const envs = await env.getVersionedEnvironments(config);
            assert.ok(false);
        } catch (e) {
            assert.strictEqual(e.message, 'cannot get project versions: missing project name (missing configuration file?)');
            assert.ok(true);
        }
    }

    @test('list builtin environments. should output a table, without versions')
    async listAll() {
        if (process.env.LOCALWSK === 'true')
            return skip(this);

        const config = init.newConfig(projectfile, process.env.LOGGER_LEVEL, 'dev');
        config.basePath = `${rootPath}/builtins`;
        await init.init(config);
        const envs = await env.getVersionedEnvironments(config);
        const local = envs.filter(env => env.policies.name === 'prod');
        assert.equal(local.length, 1);
        const dev = envs.filter(env => env.policies.name === 'dev');
        assert.equal(local.length, 1);
    }

    @test('list builtin environments. should output a table, with versions')
    async listAllWithVersion() {
        if (process.env.LOCALWSK === 'true')
            return skip(this);

        const config = init.newConfig(projectfile, process.env.LOGGER_LEVEL, 'prod@0.0.0');
        config.basePath = `${rootPath}/builtins`;

        await init.init(config);
        const set = await env.setEnvironment(config);
        assert.ok(set);
        const envs = await env.getVersionedEnvironments(config);
        // console.log(envs);
        const prod = envs.filter(env => env.policies.name === 'prod');
        assert.ok(prod);
        assert.equal(prod.length, 1);
        // console.log(prod[0]);
        // console.log(prod[0].versions);
        assert.equal(prod[0].versions.length, 1);

        await bx.run(config, { space: `${projectname}-prod@0.0.0` }, `account space-delete ${projectname}-prod@0.0.0 -f`);
    }

    @test('set environment to dev, not persisting')
    async setEnvDev() {
        if (process.env.LOCALWSK === 'true')
            return skip(this);

        await fs.remove('.wskprops');
        process.env.BLUEMIX_HOME = `${bxroot}/${projectname}-dev`;

        const config = init.newConfig(projectfile, process.env.LOGGER_LEVEL, 'dev');
        config.basePath = `${rootPath}/builtins`;
        await init.init(config);
        const success = await env.cacheEnvironment(config);
        assert.ok(success);

        const wskprops = parser.read(`${bxroot}/${projectname}-dev/.wskprops`);
        const envprops = parser.read(`${cacheroot}/envs/.dev.wskprops`);

        assert.strictEqual(wskprops.AUTH, envprops.AUTH);
        assert.strictEqual(wskprops.APIGW_ACCESS_TOKEN, envprops.APIGW_ACCESS_TOKEN);
        assert.strictEqual(wskprops.APIHOST, envprops.APIHOST);

        assert.ok(! await fs.pathExists('.wskprops')); // shouldn't be there

        // cleanup
        await bx.run(config, { space: `${projectname}-dev` }, `iam space-delete ${projectname}-dev -f`);
        await fs.remove('.wskprops');
        delete process.env.BLUEMIX_HOME;
    }

    @test('set environment to dev, persisting')
    async setEnvDevPersisting() {
        if (process.env.LOCALWSK === 'true')
            return skip(this);

        assert.ok(!await fs.pathExists('.wskprops'));

        const config = init.newConfig(projectfile, process.env.LOGGER_LEVEL, 'dev');
        config.basePath = `${rootPath}/builtins`;
        await init.init(config);

        const set = await env.setEnvironment(config);
        assert.ok(set);
        assert.ok(await fs.pathExists('.wskprops'));

        const wskprops = parser.read(`${bxroot}/${projectname}-dev/.wskprops`);
        const envprops = parser.read(`.wskprops`);

        assert.strictEqual(wskprops.AUTH, envprops.AUTH);
        assert.strictEqual(wskprops.APIGW_ACCESS_TOKEN, envprops.APIGW_ACCESS_TOKEN);
        assert.strictEqual(wskprops.APIHOST, envprops.APIHOST);
        assert.equal(envprops.ENVNAME, 'dev');

        // cleanup
        await fs.remove('.wskprops');
    }

    @test('change current environment from dev to prod')
    async setEnvFromDevToProd() {
        if (process.env.LOCALWSK === 'true')
            return skip(this);

        assert.ok(!await fs.pathExists('.wskprops'));

        const config = init.newConfig(projectfile, process.env.LOGGER_LEVEL, 'dev');
        config.basePath = `${rootPath}/builtins`;
        await init.init(config);

        const set = await env.setEnvironment(config);
        assert.ok(set);
        assert.ok(await fs.pathExists('.wskprops'));
        const wskprops = parser.read('.wskprops');
        assert.equal(wskprops.ENVNAME, 'dev');

        const configprod = init.newConfig(projectfile, process.env.LOGGER_LEVEL, 'prod@0.0.0');
        configprod.basePath = `${rootPath}/builtins`;
        await init.init(configprod);
        const set2 = await env.setEnvironment(configprod);
        assert.ok(set2);

        assert.ok(await fs.pathExists('.wskprops'));
        const wskpropsprod = parser.read('.wskprops');
        assert.equal(wskpropsprod.ENVNAME, 'prod');
        assert.equal(wskpropsprod.ENVVERSION, '0.0.0');

        // cleanup
        await fs.remove('.wskprops');
    }

    @test.only('try to deploy on non-writable environment')
    async noWritableEnv() {
        if (process.env.LOCALWSK === 'true')
            return skip(this);

        const configprod = init.newConfig('managed.yaml', process.env.LOGGER_LEVEL, 'prod@0.0.0');
        configprod.basePath = `${rootPath}/../nodejs`;
        await init.init(configprod);
        await env.cacheEnvironment(configprod);
        await undeploy.apply(configprod);
        await deploy.apply(configprod); // ok

        try {
            const configprod2 = init.newConfig('managed.yaml', process.env.LOGGER_LEVEL, 'prod@0.0.0');
            configprod2.basePath = `${rootPath}/../nodejs`;
            await init.init(configprod2);
            await env.cacheEnvironment(configprod2);
            await deploy.apply(configprod2); // not ok
            assert.ok(false);
        } catch (e) {
            assert.ok(true);
        }

        // cleanup
        await bx.run(configprod, { space: `${projectname}-prod@0.0.0` }, `iam space-delete ${projectname}-prod@0.0.0 -f`);
    }

}
