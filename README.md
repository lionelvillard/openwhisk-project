[![Build Status](https://travis-ci.org/lionelvillard/openwhisk-deploy.svg?branch=master)](https://travis-ci.org/lionelvillard/openwhisk-deploy) ![Dependencies](https://david-dm.org/lionelvillard/openwhisk-deploy.svg)

This project provides a set of tools for managing a collection of OpenWhisk entities and related services (eg. Cloudant, Redis, etc...).      
 
# Getting started

```bash
$ npm install @openwhisk/deploy --save
```

# Main Features

- deploy: deploy a set of OpenWhisk entities from description stored in [deployment configuration files](docs/format.md).
- undeploy: undeploy a set of managed OpenWhisk entities.
- clean: remove *all* deployed entities in a namespace.
- refresh: update the local deployment configuration files against deployed entities.
- sync: update the local deployment configuration files against files stored locally.

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
