[![Build Status](https://travis-ci.org/lionelvillard/openwhisk-deploy.svg?branch=master)](https://travis-ci.org/lionelvillard/openwhisk-deploy)

This project provides a tool for deploying OpenWhisk entities specified in the format described below.
 
# Getting started

```bash
$ npm install @openwhisk-libs/deploy --save
```

# Features

The main features that are currently implemented are:
* deploy and undeploy a set of OpenWhisk entities
* safe namespace sharing: deploy multiple independent projects into a single OpenWhisk namespace
* robust [undeploy](docs/format/md#Properties): changes in the deployment file does not affect undeploy
* automatic dependencies management (ie. actions in a sequence are deployed before the sequence itself)
* extensible deployment format via [plugin](plugins/README.md) (experimental)
* [modular](docs/format.md#includes) specification
* concurrent deployment and undeployment

Supported action kinds: 
- single nodejs file
- nodejs packages 
- inline nodejs code
- docker

# Example

```yaml

# try-catch combinator example
packages:
  plugin-combinator-1:
    actions:
      safeToDelete:
        kind: nodejs
        code: |
          if (params.delete)
            return {}
          throw new Error('Oh No!')

      delete:
        kind: nodejs
        code: |
          delete params[params.delete]
          return params

      handleError:
        kind: nodejs
        code: |
          return {status: 'Um a very bad thing just happened - sorry?'}

      trycatch:
        combinator: try safeToDelete catch handleError

      eca:
        combinator: if safeToDelete then delete

      forward:
        combinator: forward ["authkey"] after safeToDelete with ["delete"]
        inputs:
          authkey: very private
          delete: something

      retry:
        combinator: retry delete 5 times
```

# Deployment format specification

See [specification](docs/format.md)

# Development

```bash
$ git clone https://github.com/lionelvillard/openwhisk-deploy.git
$ cd openwhisk-deploy
$ npm i
```

To run the tests, it is recommended to create the file `.wskprops` in the project root directory. Then do:

```bash
$ npm test
```
