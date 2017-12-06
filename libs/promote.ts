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
import { gt, valid, clean } from 'semver';
import { getVersionedEnvironments, IVersionedEnvironment, getEnvironment } from './env';
import { IConfig, IEnvironment } from './types';
import { getTags, gitURL } from './utils';
import { apply } from './deploy';
import { init, cloneConfig } from './init';
import { cacheEnvironment } from './env';

// Promote project to next level
export async function promote(config: IConfig) {
    if (!config.location)
        config.fatal('cannot promote a project without knowing where the project file is located');

    const url = await gitURL(config.basePath);
    if (!url)
        config.fatal('could not determine the git repository URL. Make sure origin exists and properly configured');

    // Get latest tag
    const latest = (await getTags(config, config.basePath)).latest;
    if (!latest)
        config.fatal('no tagged project found');
    if (!valid(latest))
        config.fatal(`invalid tag name found: ${latest}`);
    const version = clean(latest);

    // Find where it has been deployed so far
    const envs = await getVersionedEnvironments(config);

    const deployed = getEnvsWithVersion(envs, version); // deployed versions

    // traverse promote chain, starting from dev (and ignoring dev)
    const index = indexEnvs(envs);
    let current = getAllNextEnvs(index, { dev: index.dev }); // environment being considered, skipping dev

    while (Object.keys(current).length !== 0 && allDeployed(deployed, current)) {
        current = getAllNextEnvs(index, current);
    }

    const envnames = Object.keys(current);
    if (envnames.length > 0) {
        try {
            await deployAll(config, envnames, url, latest);

            return `promoted ${latest} to ${Object.keys(current).join(', ')}`;
        } catch (e) {
            throw new Error(`failed to promote ${latest} to ${Object.keys(current).join(', ')}: ${e.message}`);
        }
    }
    return `latest tag ${latest} has already fully promoted.`;
}

interface IIndexed { [key: string]: IVersionedEnvironment; }

function getAllNextEnvs(allenvs: IIndexed, envs: IIndexed): IIndexed {
    return Object.keys(envs).reduce((next, envname) => {
        const env = allenvs[envname];
        if (env.policies.promote) {
            next = env.policies.promote.reduce((index, envname) => {
                index[envname] = allenvs[envname];
                return index;
            }, next);
        }
        return next;
    }, {});
}

function allDeployed(deployed: IIndexed, envs: IIndexed): boolean {
    for (const envname of Object.keys(envs)) {
        if (!deployed.hasOwnProperty(envname)) {
            return false;
        }
    }
    return true;
}

function getEnvsWithVersion(envs: IVersionedEnvironment[], version: string): IIndexed {
    return envs.reduce((matched, env) => {
        if (env.versions && env.versions.includes(version))
            matched[env.policies.name] = env;
        return matched;
    }, {});
}

// Create an index by name
function indexEnvs(envs: IVersionedEnvironment[]): IIndexed {
    return envs.reduce((index, env) => {
        index[env.policies.name] = env;
        return index;
    }, {});
}

async function deployAll(config: IConfig, envnames: string[], url: string, tag: string) {
    const fullurl = `git+${url}#${tag}`;
    const version = tag.substr(1);

    // sequential deployment so that the git repo does not occur multiple times.

    for (const name of envnames) {
        const fullname = `${name}@${version}`;
        const subcfg = cloneConfig(config, fullurl, fullname);

        await init(subcfg);
        await cacheEnvironment(subcfg);
        await apply(subcfg);
    }
}
