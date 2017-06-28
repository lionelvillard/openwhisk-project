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
const chevrotain = require('chevrotain')

// ----------------- lexer -----------------

const createToken = chevrotain.createToken
const tokenMatcher = chevrotain.tokenMatcher
const Lexer = chevrotain.Lexer
const Parser = chevrotain.Parser

const ActionLiteral = createToken({
    name: 'ActionLiteral',
    pattern: /[\w@.-]+/
})

const IfToken = createToken({
    name: 'IfToken',
    pattern: /if/
})

const ThenToken = createToken({
    name: 'ThenToken',
    pattern: /then/
})

const TryToken = createToken({
    name: 'TryToken',
    pattern: /try/,
    longer_alt: ActionLiteral
})

const CatchToken = createToken({
    name: 'CatchToken',
    pattern: /catch/
})

const RetryToken = createToken({
    name: 'RetryToken',
    pattern: /retry/
})

const ForwardToken = createToken({
    name: 'ForwardToken',
    pattern: /forward/
})

const QuotedActionLiteral = createToken({
    name: 'QuotedActionLiteral',
    pattern: /'[\w@.-][\w@ .-]*[\w@.-]'+/
})

const WhiteSpace = createToken({
    name: 'WhiteSpace',
    pattern: /\s+/,
    group: Lexer.SKIPPED
})

const allTokens = [
    WhiteSpace,
    IfToken,
    ThenToken,
    TryToken,
    CatchToken,
    RetryToken,
    ForwardToken,
    ActionLiteral,
    QuotedActionLiteral
]
const DeployLexer = new Lexer(allTokens)

// ----------------- parser -----------------

function DeployParser(input) {
    Parser.call(this, input, allTokens)

    const $ = this

    $.RULE('combinators', () => {
        return $.OR([
            {
                ALT: () => {
                    return $.SUBRULE($.eca)
                }
            },
            // {
            //     ALT: () => {
            //         return $.SUBRULE($.forwarder)
            //     }
            // },
            // {
            //     ALT: () => {
            //         return $.SUBRULE($.retry)
            //     }
            // },
            {
                ALT: () => {
                    return $.SUBRULE($.trycatch)
                }
            }
        ])
    })

    $.RULE('eca', () => {
        $.CONSUME(IfToken)
        const $conditionName = $.CONSUME1(ActionLiteral).image
        $.CONSUME(ThenToken)
        const $actionName = $.CONSUME2(ActionLiteral).image

        return {
            action: {
                copy: '/whisk.system/combinators/eca',
                inputs: {
                    $conditionName,
                    $actionName
                }
            }
        }
    })

    $.RULE('trycatch', () => {
        $.CONSUME(TryToken)
        const $tryName = $.CONSUME1(ActionLiteral).image
        $.CONSUME(CatchToken)
        const $catchName = $.CONSUME2(ActionLiteral).image

        return {
            action: {
                copy: '/whisk.system/combinators/trycatch',
                inputs: {
                    $tryName,
                    $catchName
                }
            }
        }
    })

    Parser.performSelfAnalysis(this)
}

DeployParser.prototype = Object.create(Parser.prototype)
DeployParser.prototype.constructor = DeployParser

const parser = new DeployParser([])

// --- Plugin export

module.exports = {

    getEntities: context => {
        // 1. Tokenize the input.
        const lexResult = DeployLexer.tokenize(context.action.combinator)

        // 2. Parse the Tokens vector.
        parser.input = lexResult.tokens
        const value = parser.combinators()

        value.actionName = context.actionName
        return [value]
        // return {
        //     value: value,
        //     lexResult: lexResult,
        //     parseErrors: parser.errors
        // }
    }
}
