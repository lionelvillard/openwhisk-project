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
import { ReleaseType, inc } from 'semver';
import * as fs from 'fs-extra';
import * as path from 'path';

import { IConfig } from './types';
import { EditableYAML } from './yamledit';
import { addTag, isGitRepo } from './utils';

export interface ITagOptions {
    // version increment
    incVersion?: ReleaseType;
}

// Tag a project. See details below
export async function tag(config: IConfig, options: ITagOptions) {
    if (!config.location)
        config.fatal('cannot tag a project without knowing where the project file is located');


    const git = await isGitRepo(config.basePath);
    // Check no changes.

    options = options || { incVersion: 'patch' };

    await incVersion(config, options.incVersion);

    if (git) {
        await addTag(config, config.basePath, config.manifest.version);
    }
    // tag git repo

    // tag docker images
    // optionally push git repo
}

// Increment project version
async function incVersion(config: IConfig, releaseType: ReleaseType) {
    if (!['major', 'premajor', 'minor', 'preminor', 'patch', 'prepatch', 'prerelease'].includes(releaseType))
        config.fatal('%s is not a valid release type', releaseType);

    let version = config.manifest.version || '0.0.0';
    config.manifest.version = version = inc(version, releaseType);

    const editor = new EditableYAML(config.location);
    editor.setMapValue(['version'], version);
    editor.save();
}
