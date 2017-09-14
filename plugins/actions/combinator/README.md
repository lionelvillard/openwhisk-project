This plugin adds some syntactic sugar construct to configure the deployment of [combinators](https://github.com/apache/incubator-openwhisk-catalog/tree/master/packages/combinators)

# Deployment configuration extension

Contribution point: [action](https://github.com/lionelvillard/openwhisk-deploy/blob/master/docs/format.md#action)

## Additional properties 

- combinator: (string, optional): a combinator expression written the language define below

## Example

```yaml
actions:
  forward:
    combinator: forward ["authkey"] after safeToDelete with ["delete"]
```

## Grammar

```ebnf
combinator = eca 
           | forwarder
           | retry
           | trycatch 
           ;

eca        = 'if' actionName 'then' actionName ;
forwarder  = 'forward' stringArray 'after' actionName 'with' stringArray ;
retry      = 'retry' actionName integer 'times'? ;
trycatch   = 'try' actionName 'catch' actionName ;

stringArray = '[' string (',' string)* ']' ;
```
