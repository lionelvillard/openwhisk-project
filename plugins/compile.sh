#!/bin/bash

cd core
for dir in $(ls)
do
    (cd $dir && npm run compile &)
done
