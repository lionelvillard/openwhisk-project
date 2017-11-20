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

// Utilities to edit YAML files while still preserving the original structure (includings comments)
import * as fs from 'fs-extra';

const SPACES = '                                                                                                                                                 ';

export class EditableYAML {
    // YAML content
    public lines: string[];

    // YAML file location
    public location: string;

    constructor(locationOrLines: string | string[]) {
        if (typeof locationOrLines === 'string') {
            this.location = locationOrLines;
            this.lines = fs.readFileSync(this.location, 'utf8').split('\n');
        } else {
            this.lines = locationOrLines;
        }
    }

    save() {
        const content = this.lines.join('\n');
        if (this.location)
            fs.writeFileSync(this.location, content, 'utf8');
        return content;
    }

    // Set the value of the map pointed by path
    setMapValue(path: string[], value: any) {
        if (!path || path.length === 0)
            throw new Error(`invalid path argument: must at least contains one property name`);

        const line = this.getLine(path);
        const indent = path.length * 2;
        const yaml = this.jsonToYaml(value, indent).split('\n');
        yaml.splice(0, 1);
        this.lines.splice(line + 1, 0, ...yaml);
    }

    private jsonToYaml(value: any, indent = 0) {
        switch (typeof value) {
            case 'object':
                // TODO: array
                let yaml = '';
                Object.keys(value).forEach(key => {
                    yaml = `${yaml}
${SPACES.substr(0, indent)}${key}:${this.jsonToYaml(value[key], indent + 2)}`;
                });
                return yaml;
            case 'string':
            case 'boolean':
            case 'number':
                return ` ${value}`; // TODO: escaping
        }
    }

    private getLine(path: string[]) {
        // Assume indentation == 2 and no flow style
        let lineno = 0; // 0-based.
        path.forEach((name, index) => {
            const indentation = index * 2;
            const nlineno = this.getLineNumber(name, lineno, indentation);
            if (nlineno === -1) {
                const lastlineno = this.getLastLineSameIndent(lineno + 1, indentation);
                this.lines.splice(lastlineno, 0, `${SPACES.substr(0, indentation)}${name}:`);

                lineno = lastlineno;
            } else {
                lineno = nlineno;
            }
        });
        return lineno;
    }

    private getLineNumber(name: string, from: number, indentation: number) {
        for (let index = from; index < this.lines.length; index++) {
            if (this.lines[index].startsWith(name, indentation))
                return index;
        }
        return -1;
    }

    private getLastLineSameIndent(from: number, indentation: number) {
        while (from < this.lines.length && this.getLineIndent(this.lines[from]) >= indentation) {
            from++;
        }
        return from === this.lines.length ? from + 1 : from;
    }

    private getLineIndent(line: string) {
        return line.match(/(\s*)/)[0].length;
    }

}
