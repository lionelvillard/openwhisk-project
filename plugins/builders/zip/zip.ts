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

// import * as wskd from 'openwhisk-deploy';
import * as path from 'path';
import * as fs from 'fs-extra';
import { exec } from 'child-process-promise';
import * as archiver from 'archiver';

// --- Plugin export

export async function build(config, pkgName: string, actionName: string, action, builddir: string) {
    const isFile = fs.statSync(action.location).isFile();
    const baseSrcLoc = isFile ? path.dirname(action.location) : action.location;
 
    const baseLocInCache = builddir;
    const srcLocInCache = path.join(baseLocInCache, '/src')
    const ziplocInCache = path.join(baseLocInCache, 'action.zip')

    const copyOptions = {
        preserveTimestamps: true,
        dereference: true,
        filter: src => {
            const basename = path.basename(src)
            //console.log(src)

            // TODO: read .npmignore

            return true
        }
    }

    await fs.mkdirs(`${baseLocInCache}/src`);
    await fs.copy(baseSrcLoc, srcLocInCache, copyOptions);
    await npmInstall(srcLocInCache);
    await zip(ziplocInCache, srcLocInCache);
    return {
        location: ziplocInCache,
        binary : true
    }
}

async function npmInstall(src) {
    const execOptions = {
        cwd: src
    }

    // see https://github.com/npm/npm/pull/7249 for extra etc directory

    exec(`npm  install --production --prefix .`, execOptions)
}

const zip = (targetZip, src) => new Promise((resolve, reject) => {
    const output = fs.createWriteStream(targetZip)
    const archive = archiver('zip', {
        zlib: { level: 9 }
    })

    output.on('close', () => {
        resolve()
    })

    archive.on('error', err => {
        reject(err)
    })

    // pipe archive data to the file
    archive.pipe(output)

    // append files from src directory
    archive.directory(src, '.')

    // finalize the archive (ie we are done appending files but streams have to finish yet)
    archive.finalize()
})
