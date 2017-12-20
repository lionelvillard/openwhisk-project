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
import * as ye from '../libs/yamledit';
import * as yaml from 'yamljs';

@suite('YAML Edit Test Suite')
class YamlEditTest {

    @test('Add property to empty YAML')
    async addToEmpty() {
        const editor = new ye.EditableYAML([]);
        editor.setMapValue(['env', 'dev'], { writable: true });
        const content = editor.save();
        const y = yaml.parse(content);
        assert.deepStrictEqual(y, { env: { dev: { writable: true } } });
    }

    @test('Add property to non-empty YAML')
    async addToNonEmpty() {
        const editor = new ye.EditableYAML(['name: project']);
        editor.setMapValue(['env', 'dev'], { writable: true });
        const content = editor.save();
        const y = yaml.parse(content);
        assert.deepStrictEqual(y, { name: 'project', env: { dev: { writable: true } } });
    }

    @test('Add property to non-empty YAML with comments')
    async addToNonEmptyWithComments() {
        const editor = new ye.EditableYAML(['# project name', 'name: project']);
        editor.setMapValue(['env', 'dev'], { writable: true });
        const content = editor.save();
        const y = yaml.parse(content);
        assert.deepStrictEqual(y, { name: 'project', env: { dev: { writable: true } } });
    }

    @test('Add property to existing path level 0')
    async addToExistingPath0() {
        const editor = new ye.EditableYAML(['# project name', 'name: project', 'env:']);
        editor.setMapValue(['env', 'dev'], { writable: true });
        const content = editor.save();
        const y = yaml.parse(content);
        assert.deepStrictEqual(y, { name: 'project', env: { dev: { writable: true } } });
    }

    @test('Add property to existing path level 1')
    async addToExistingPath1() {
        const editor = new ye.EditableYAML(['# project name', 'name: project', 'env:', '  dev:']);
        editor.setMapValue(['env', 'dev'], { writable: true });
        const content = editor.save();
        const y = yaml.parse(content);
        assert.deepStrictEqual(y, { name: 'project', env: { dev: { writable: true } } });
    }

    @test('Add property to existing path level 1 with multiple properties')
    async addToExistingPathMultiple() {
        const editor = new ye.EditableYAML(['# project name', 'name: project', 'env:', '  test:']);
        editor.setMapValue(['env', 'dev'], { writable: true });
        const content = editor.save();
        const y = yaml.parse(content);
        assert.deepStrictEqual(y, { name: 'project', env: { test: null, dev: { writable: true } } });
    }

    @test('Add property to existing path level 1 with multiple valued properties')
    async addToExistingPathMultipleWithValue() {
        const editor = new ye.EditableYAML(['# project name', 'name: project', 'env:', '  test:', '    writable: true']);
        editor.setMapValue(['env', 'dev'], { writable: true });
        const content = editor.save();
        const y = yaml.parse(content);
        assert.deepStrictEqual(y, { name: 'project', env: { test: { writable: true }, dev: { writable: true } } });
    }

    @test('Add property to existing path level 1 with existing property after insertion point')
    async addToExistingPathWithAfter() {
        const editor = new ye.EditableYAML(['# project name', 'name: project', 'env:', '  test:', '    writable: true', 'apis: "apic"']);
        editor.setMapValue(['env', 'dev'], { writable: true });
        const content = editor.save();
        const y = yaml.parse(content);
        assert.deepStrictEqual(y, { name: 'project', env: { test: { writable: true }, dev: { writable: true } }, apis: 'apic' });
    }

    @test('Create inlined string value')
    async inlinedCreate() {
        const editor = new ye.EditableYAML([]);
        editor.setMapValue(['version'], '0.1.0');
        const content = editor.save();
        const y = yaml.parse(content);
        assert.deepStrictEqual(y, { version: '0.1.0' });
    }

    @test('Update inlined string value')
    async inlinedUpdate() {
        const editor = new ye.EditableYAML(['version: 0.1.0']);
        editor.setMapValue(['version'], '0.2.0');
        const content = editor.save();
        const y = yaml.parse(content);
        assert.deepStrictEqual(y, { version: '0.2.0' });
    }

}
