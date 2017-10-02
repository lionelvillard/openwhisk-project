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
import * as pkg from '../package';
import { suite, test, slow, timeout } from 'mocha-typescript';
import * as assert from 'assert';
import * as wskd from 'openwhisk-deploy';
import * as path from 'path';
import * as fs from 'fs-extra';

@suite('Package - Unit Tests')
class copyUnit {

    ctx;
    builddir: string;

    async before() {
        this.ctx = {};
        this.builddir = path.join(__dirname, '..', '..', '..', '..', '..', '.openwhisk', 'build', 'package-plugin');
    }

    @test('Zip nodejs action - all')
    async zip_nodejs() {
        await fs.remove(this.builddir);
        const loc = await pkg.build(this.ctx, { location: 'nodejs-zip/package.json' }, { dir: this.builddir });
        assert(await fs.pathExists(loc));
    }

    @test('Zip nodejs action - follow links')
    async zip_nodejs_follow() {
        await fs.remove(this.builddir);
        const loc = await pkg.build(this.ctx, { location: 'nodejs-zip-symlinks/package.json' }, { dir: this.builddir, follow: true });
        assert(await fs.pathExists(loc));
    }


    @test('Zip nodejs action - sugar')
    async zip_nodejs_sugar() {
        const contribution = await pkg.actionContributor(this.ctx, {}, 'pkg', 'zip-action', { package: { excludes: ['*.ts'] } });
        assert.deepStrictEqual(contribution,
            [{
                "kind": "action",
                "pkgName": "pkg",
                "name": "zip-action",
                "body": {
                    "builder": {
                        "name": "package",
                        "excludes": [
                            "*.ts"
                        ]
                    }
                }
            }
          ]);
    }

}
