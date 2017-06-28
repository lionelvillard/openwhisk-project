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
const Lexer = chevrotain.Lexer
const Parser = chevrotain.Parser

const ActionLiteral = createToken({name: 'ActionLiteral', pattern: /[\w@.-]+/})
const IfToken = createToken({name: 'IfToken', pattern: /if/})
const ThenToken = createToken({name: 'ThenToken', pattern: /then/})
const TryToken = createToken({name: 'TryToken', pattern: /try/, longer_alt: ActionLiteral})
const CatchToken = createToken({name: 'CatchToken', pattern: /catch/})
const RetryToken = createToken({name: 'RetryToken', pattern: /retry/})
const ForwardToken = createToken({name: 'ForwardToken', pattern: /forward/})
const AfterToken = createToken({name: 'AfterToken', pattern: /after/})
const WithToken = createToken({name: 'WithToken', pattern: /with/})
const TimesToken = createToken({name: 'TimesToken', pattern: /times/})
const LSquare = createToken({name: 'LSquare', pattern: /\[/})
const RSquare = createToken({name: 'RSquare', pattern: /]/})
const Comma = createToken({name: 'Comma', pattern: /,/})
const IntegerLiteral = createToken({name: "IntegerLiteral", pattern: /\d+/})

const QuotedActionLiteral = createToken({
    name: 'QuotedActionLiteral',
    pattern: /'[\w@.-][\w@ .-]*[\w@.-]'+/
})

const StringLiteral = createToken({
    name: 'StringLiteral',
    pattern: /"(?:[^\\"]|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/
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
    AfterToken,
    WithToken,
    TimesToken,
    LSquare,
    RSquare,
    Comma,

    IntegerLiteral,
    ActionLiteral,
    QuotedActionLiteral,
    StringLiteral
]
const DeployLexer = new Lexer(allTokens)

// ----------------- parser -----------------

const TrimQuotes = str => {
    return str.substr(1, str.length - 2)
}

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
            {
                ALT: () => {
                    return $.SUBRULE($.forwarder)
                }
            },
            {
                ALT: () => {
                    return $.SUBRULE($.retry)
                }
            },
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

    $.RULE('forwarder', () => {
        $.CONSUME(ForwardToken)
        const $forward = $.SUBRULE($.arrayofstrings)
        $.CONSUME(AfterToken)
        const $actionName = $.CONSUME(ActionLiteral).image
        $.CONSUME(WithToken)
        const $actionArgs = $.SUBRULE2($.arrayofstrings)

        return {
            action: {
                copy: '/whisk.system/combinators/forwarder',
                inputs: {
                    $forward,
                    $actionName,
                    $actionArgs
                }
            }
        }
    })

    $.RULE('retry', () => {
        $.CONSUME(RetryToken)
        const $actionName = $.CONSUME(ActionLiteral).image
        const $attempts = parseInt($.CONSUME(IntegerLiteral).image)
        $.OPTION(() => {
            $.CONSUME(TimesToken)
        })
        return {
            action: {
                copy: '/whisk.system/combinators/retry',
                inputs: {
                    $actionName,
                    $attempts
                }
            }
        }
    })

    $.RULE('arrayofstrings', () => {
        const strings = []
        $.CONSUME(LSquare)
        $.OPTION(() => {
            strings.push(TrimQuotes($.CONSUME1(StringLiteral).image))

            $.MANY(() => {
                $.CONSUME2(Comma)
                strings.push(TrimQuotes($.CONSUME3(StringLiteral).image))
            })
        })
        $.CONSUME4(RSquare)
        return strings
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
        if (lexResult.errors.length > 0)
            throw lexResult.errors

        // 2. Parse the Tokens vector.
        parser.input = lexResult.tokens
        const value = parser.combinators()
        if (parser.errors.length > 0)
            throw parser.errors

        value.actionName = context.actionName
        return [value]
    }
}
