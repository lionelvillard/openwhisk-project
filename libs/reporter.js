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

// TODO: deprecate and use log4js



const reportEntity = (report, name) => subreport => {
    report[name] = subreport
    return report
}
exports.entity = reportEntity

const reportPackage = qname => deployResult => ({qname, deployResult})
exports.package = reportPackage

const reportBinding = qname => deployResult => ({qname, deployResult})
exports.binding = reportBinding

const reportAction = (qname, location, kind, params) => deployResult => ({
    qname,
    location,
    kind,
    params,
    deployResult
})
exports.action = reportAction

const reportTrigger = triggerName => deployResult => ({triggerName, deployResult})
exports.trigger = reportTrigger

const reportFeed = (report, feed, params) => deployResult => {
    report.feed = feed
    report.feedParams = params

    // TODO: decide what to do when recreating a feed
    //report.feedDeployResult = deployResult

    return report
}
exports.feed = reportFeed

const reportRule = ruleName => deployResult => ({ruleName, deployResult})
exports.rule = reportRule
