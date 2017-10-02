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

import * as wskd from 'openwhisk-deploy';
import * as path from 'path';
import * as fs from 'fs-extra';
import { exec } from 'child-process-promise';
import * as archiver from 'archiver';

// --- Plugin export

export function actionContributor(config: wskd.IConfig, project, pkgName: string, actionName: string, action) {
    const newaction = {...action, 
        builder: {
          name: 'package',
          ...action.package
        }
    }
    delete newaction.package;
    return [
            {
                kind: "action",
                pkgName,
                name: actionName,
                body: newaction
            }
    ];
}

export async function build(config: wskd.IConfig, action, builder): Promise<string> {
    let basePath = path.dirname(action.location);
    const ziplocInCache = path.join(builder.dir, 'action.zip')
    await fs.mkdirs(builder.dir);

    await zip(config, ziplocInCache, basePath, builder);
    return ziplocInCache;
}

const zip = (config, targetZip, basePath, builder) => new Promise((resolve, reject) => {
    const output = fs.createWriteStream(targetZip);

    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    output.on('close', () => {
        resolve()
    });

    archive.on('error', err => {
        reject(err)
    });

    archive.on('warning', err => {
        if (err.code === 'ENOENT') {
            config.logger.warning(err.message);
        } else {
            reject(err);
        }
    });


    // pipe archive data to the file
    archive.pipe(output);

    // append files 
    const ignore = builder.excludes || [];
    const follow = builder.follow || false;
    const includes = builder.includes || '**';
    const globs = typeof includes == 'string' ? [includes] : includes;
    for (const glob of globs) {
        archive.glob(glob, {
            cwd: basePath,
            ignore,
            follow
        });
    }

    // finalize the archive (ie we are done appending files but streams have to finish yet)
    archive.finalize();
})


// async function npmInstall(src) {
//     const execOptions = {
//         cwd: src
//     }

//     // see https://github.com/npm/npm/pull/7249 for extra etc directory

//     exec(`npm  install --production --prefix .`, execOptions)
// }
