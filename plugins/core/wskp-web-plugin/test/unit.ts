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
import * as web from '../web';
import { suite, test, slow, timeout } from 'mocha-typescript';
import * as assert from 'assert';

@suite
class WebUnit {

    @test
    basicForm() {
        const result = web.actionContributor({basePath: '.'}, null, 'pkg', 'basic', { web: './test/icon.svg' });
        assert.ok(result)
        assert.deepStrictEqual(result[0].body.web.headers, { "Content-Type": "image/svg+xml" });
    }
}