/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
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
import * as init from './init';
import { IWskProps, IConfig, IEnvironment } from './types';
import * as bx from './bluemix';
import * as utils from './utils';
import * as readdir from 'recursive-readdir';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as propertiesParser from 'properties-parser';
import * as expandHome from 'expand-home-dir';
import * as openwhisk from 'openwhisk';
import * as ye from './yamledit';

// TODO:
const BuiltinEnvs = {
    dev: { name: 'dev', writable: true, versioned: false, entities: 'all', props: { APIHOST: 'openwhisk.ng.bluemix.net' } },
    prod: { name: 'prod', writable: false, versioned: true, entities: 'all', props: { APIHOST: 'openwhisk.ng.bluemix.net' } }
};

const BuiltinEnvNames = Object.keys(BuiltinEnvs);
const ALL_WSKPROPS = '.all.wskprops';

// Get properties in current environment
export async function getCurrent(config: IConfig): Promise<IWskProps | null> {
    const subcfg = { ...config };
    delete subcfg.envname;
    return readWskProps(subcfg);
}

export interface IVersionedEnvironment {
    policies: IEnvironment;
    versions: string[];
}

// Get all environments along with versions for the current project.
export async function getVersionedEnvironments(config: IConfig): Promise<IVersionedEnvironment[]> {
    const allpolicies = getEnvironments(config);
    const versions = await getVersions(config);
    return allpolicies.map(policies => ({ policies, versions: versions[policies.name] }));
}

export function getEnvironments(config: IConfig): IEnvironment[] {
    const envs = { ...BuiltinEnvs, ...(config.manifest ? config.manifest.environments : {}) };
    return Object.keys(envs).map(key => envs[key]);
}

export function getEnvironment(config: IConfig, envname: string): IEnvironment {
    const envs = getEnvironments(config);
    return envs ? envs.find(env => env.name === envname) : null;
}

// Set current environment.
export async function setEnvironment(config: IConfig) {
    const cached = await cacheEnvironment(config);
    if (!cached)
        return false;

    const exists = await fs.pathExists('.wskprops');
    if (exists) {
        await fs.copy('.wskprops', '.wskprops.bak', { overwrite: true });
    }
    await fs.copy(cached, '.wskprops', { overwrite: true });
    return true;
}

// Refresh cached resolved environments, if needed
export async function cacheEnvironment(config: IConfig) {
    config.startProgress('checking cache up-to-date');

    await isValid(config);
    const name = config.envname;
    const version = config.version;

    // user-defined properties
    const filename = `.${name}.wskprops`;
    const exists = await fs.pathExists(filename);

    //  properties applicable to all environments
    const allExists = await fs.pathExists(ALL_WSKPROPS);

    // cached properties
    const cached = getCachedEnvFilename(config);
    await fs.mkdirs(path.dirname(cached));
    const cachedExists = await fs.pathExists(cached);

    const refreshCache = async () => {
        config.logger.debug('refreshing cache');
        const props = propertiesParser.createEditor(allExists ? ALL_WSKPROPS : '');
        addAll(props, propertiesParser.read(filename));
        try {
            await resolveProps(config, name, version, filename, props);
        } catch (e) {
            config.logger.error(e);
            return false;
        }

        props.save(cached);
        return true;
    };

    let success = true;
    if (cachedExists) {
        config.logger.debug('cache file exists');

        if (exists) {
            // Just check cache is up-to-date
            const stat1 = await fs.stat(filename);
            const stat2 = allExists ? await fs.stat(ALL_WSKPROPS) : null;
            const stat3 = await fs.stat(cached);
            if (stat1.ctimeMs > stat3.ctimeMs || (stat2 && stat2.ctimeMs > stat3.ctimeMs)) {
                success = await refreshCache();
            }
        } else {
            // no user-defined properties, so cached values are fine.
        }
    } else {
        config.logger.debug('cache file does not exist');
        // No cached properties.

        if (!exists) {
            // It's a builtin environment => generate corresponding .wskprops
            const allPolicies = await getEnvironments(config);
            const policies = allPolicies.find(v => v.name === name);
            await saveWskPropsForEnv(config, name, policies.props);
        }

        success = await refreshCache();
    }

    config.terminateProgress();
    return success ? cached : null;
}

async function saveWskPropsForEnv(config: IConfig, name: string, wskprops: IWskProps) {
    config.logger.info(`creating environment ${name}`);
    const filename = `.${name}.wskprops`;
    if (await fs.pathExists(filename))
        config.fatal('environment %s already exists', name);

    const props = propertiesParser.createEditor();
    if (wskprops)
        Object.keys(wskprops).forEach(key => props.set(key, wskprops[key]));
    props.save(filename);
}

// Create new environment
export async function newEnvironment(config: IConfig, env: IEnvironment) {
    if (!config.location)
        config.fatal('cannot create a new environment without knowing where the project file is located');

    if (config.manifest.environments.hasOwnProperty(env.name))
        config.fatal('environment %s already exists', env.name);

    const minimized: any = {};
    if (env.writable) minimized.writable = true;
    if (env.versioned) minimized.versioned = true;

    const editor = new ye.EditableYAML(config.location);
    editor.setMapValue(['env', env.name], minimized);
    editor.save();
}

// // Promote API environment to latest PROD
// export async function promote(config: IConfig) {
//     const versions = await getVersions(config);
//     if (versions && versions.prod && versions.prod.length > 0) {
//         const prods = versions.prod;
//         const latest = prods[prods.length - 1];

//         if (!(await fs.pathExists('.api.wskprops')))
//             await saveWskPropsForEnv(config, 'api', BuiltinEnvs.find(obj => obj.name === 'api').props);

//         let content = await fs.readFile('.api.wskprops', 'utf-8');
//         content = content.replace(/(PRODVERSION[^=]*=).*/, `$1${latest}`);
//         await fs.writeFile('.api.wskprops', content, { encoding: 'utf-8' });
//         return true;
//     }
//     return false;
// }

// --- Helpers

async function resolveProps(config: IConfig, env: string, version: string, filename: string, props) {
    config.logger.info('resolve wsk properties');
    let apihost = props.get('APIHOST');
    if (!apihost) {
        config.logger.info('no api host. Use default openwhisk.ng.bluemix.net');
        apihost = 'openwhisk.ng.bluemix.net';
        props.set('APIHOST', apihost);
    }

    props.set('PROJECTNAME', config.projectname);
    props.set('ENVNAME', env);
    if (version)
        props.set('ENVVERSION', version);

    if (!props.get('AUTH') || !props.get('APIGW_ACCESS_TOKEN')) {
        if (apihost.endsWith('bluemix.net')) {
            await bx.resolveAuth(config, props, env, version);
        } else {
            config.fatal('no AUTH variable found');
        }
    }
}

export async function getWskPropsFile(config: IConfig) {
    let wskprops = process.env.WSK_CONFIG_FILE;
    if (!wskprops || !fs.existsSync(wskprops)) {

        // environment mode?
        if (config.envname)
            return getCachedEnvFilename(config);

        // fallback to default resolution method
        const until = path.dirname(expandHome('~'));
        let current = process.cwd();
        while (current !== '/' && current !== until) {
            wskprops = path.join(current, '.wskprops');

            if (fs.existsSync(wskprops))
                break;
            current = path.dirname(current);
        }
    }
    return wskprops;
}

export async function readWskProps(config: IConfig): Promise<IWskProps | null> {
    const wskprops = await getWskPropsFile(config);
    if (wskprops) {
        try {
            config.logger.info(`reading ${wskprops}`);
            return propertiesParser.read(wskprops);
        } catch (e) {
            config.logger.debug(e);
            return null;
        }
    }
    config.logger.info('no wskprops found');
    return null;
}

const auth = async (config: IConfig) => {
    const wskprops = await readWskProps(config);

    if (wskprops) {
        return {
            api_key: wskprops.AUTH,
            apihost: wskprops.APIHOST,
            ignore_certs: wskprops.IGNORE_CERTS || false,
            apigw_token: wskprops.APIGW_ACCESS_TOKEN
        };
    }

    return null;
};

// Resolve variables by merging command line options with .wskprops content
export async function resolveVariables(config: IConfig, options: any = {}) {
    const wskprops = await readWskProps(config) || {};
    const variables: any = {};

    variables.auth = options.auth || process.env.WHISK_AUTH || wskprops.AUTH;
    variables.apihost = options.apihost || process.env.WHISK_APIHOST || wskprops.APIHOST;
    variables.ignore_certs = options.ignore_certs || process.env.WHISK_IGNORE_CERTS || wskprops.IGNORE_CERTS || false;
    variables.apigw_token = options.apigw_token || process.env.WHISK_APIGW_ACCESS_TOKEN || wskprops.APIGW_ACCESS_TOKEN;

    return variables;
}

export async function initWsk(config: IConfig = {}, options: IWskProps = {}) {
    const vars = await resolveVariables(config, options);
    if (vars.apihost && vars.apihost.endsWith('bluemix.net')) {
        await bx.initWsk(config, vars);
    }
    return openwhisk({ api_key: vars.auth, apihost: vars.apihost, ignore_certs: vars.ignore_certs, apigw_token: vars.apigw_token });
}

function getCachedEnvFilename(config: IConfig) {
    return path.join(config.cache, 'envs', `.${config.envname}${config.version ? `@${config.version}` : ''}.wskprops`);
}

function addAll(props, others) {
    Object.keys(others).forEach(key => props.set(key, others[key]));
}

// Retrieve all versions for all environments
async function getVersions(config: IConfig): Promise<{ [key: string]: any }> {
    if (!await bx.isBluemixCapable())
        config.fatal('cannot get the versions associated to the project environments: bx is not installed');

    if (!config.projectname)
        config.fatal('cannot get project versions: missing project name (missing configuration file?)');

    const props = await readWskProps(config);
    if (!props)
        return {};

    const versions = {};

    // TODO: support for multiple orgs
    if (props.BLUEMIX_ORG && props.BLUEMIX_SPACE) {
        config.startProgress('getting environment versions');

        const cred = { org: props.BLUEMIX_ORG, space: props.BLUEMIX_SPACE };
        const io = await bx.run(config, cred, 'iam spaces'); // long! Consider caching result
        const stdout = io.stdout;
        const regex = new RegExp(`${config.projectname}-([\\w]+)@([\\w\\d.]+)`, 'g');

        let match;
        while ((match = regex.exec(stdout)) !== null) {
            const env = match[1];
            if (!versions[env])
                versions[env] = [];
            versions[env].push(match[2]);
        }

        config.terminateProgress();
    }

    return versions;
}

async function isValid(config: IConfig) {
    const name = config.envname;
    const version = config.version;

    // no cache for envname. Check it's valid
    const allpolicies = await getEnvironments(config);
    const policies = allpolicies.find(policies => policies.name === name);
    if (!policies)
        config.fatal('environment %s does not exist', name);

    if (!policies.versioned && version)
        config.fatal('environment %s  does not support versioning', name);

    if (policies.versioned && !version) {
        // get app version
        if (config.manifest)
            config.version = config.manifest.version;

        if (!config.version)
            config.fatal('missing version');
    }
}
