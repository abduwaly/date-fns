#!/usr/bin/env babel-node

import fsp from 'fs-promise'
import path from 'path'
import parseJSDoc from 'jsdoc-parse'
import listFiles from './_lib/list_files'
import docsConfig from '../docs'
import { cloneDeep, snakeCase } from 'lodash'

generateDocsFromSource()
  .then(generatedDocsObj)
  .then(injectStaticDocsToDocsObj)
  .then(writeDocsFile)
  .catch(reportErrors)

/**
 * Generates docs object from a list of functions using extended JSDoc format.
 */
function generateDocsFromSource() {
  return listFiles()
    .reduce((promise, file) => {
      return promise.then(acc => generateDocFromSource(acc, file))
    }, Promise.resolve([]))
    .then(jsDocs =>
      jsDocs.map(doc => {
        const args = paramsToTree(doc.params)

        return {
          type: 'jsdoc',
          urlId: doc.name,
          category: doc.category,
          title: doc.name,
          description: doc.summary,
          content: doc,
          args,
          usage: generateUsage(doc.name),
          usageTabs: ['commonjs', 'umd', 'es2015'],
          syntax: generateSyntaxString(doc.name, args)
        }
      })
    )
}

/**
 * Generates docs object.
 */
function generatedDocsObj(docs) {
  return groupDocs(docs, docsConfig.groups)
}

/**
 * Injects static docs (markdown documents specified in the config file)
 * to docs object.
 */
function injectStaticDocsToDocsObj(docsFileObj) {
  return getListOfStaticDocs().then(staticDocs => {
    staticDocs.forEach(staticDoc => {
      docsFileObj[staticDoc.category].push(staticDoc)
    })
    return docsFileObj
  })
}

/**
 * Prints an error and exits the process with 1 status code.
 */
function reportErrors(err) {
  console.error(err.stack)
  process.exit(1)
}

/**
 * Writes docs file.
 */
function writeDocsFile(docsFileObj) {
  const jsonPath = path.join(process.cwd(), 'dist', 'date_fns_docs.json')
  return fsp.writeFile(jsonPath, JSON.stringify(docsFileObj))
}

/**
 * Generates docs object from a function using extended JSDoc format.
 */
function generateDocFromSource(acc, fn) {
  return new Promise((resolve, reject) => {
    const stream = parseJSDoc({ src: fn.fullPath })
    var data = ''

    stream.on('error', err => {
      console.error(err)
      process.exit(1)
    })

    stream.on('data', chunk => {
      data += chunk
    })
    stream.on('end', () => resolve(JSON.parse(data)))
  }).then(doc => acc.concat(doc))
}

/**
 * Groups passed docs list.
 */
function groupDocs(docs, groups) {
  return docs.reduce((acc, doc) => {
    ;(acc[doc.category] = acc[doc.category] || []).push(doc)
    return acc
  }, buildGroupsTemplate(groups))
}

/**
 * Builds an object where the key is a group name and the value is
 * an empty array. Pre-generated docs object allows to preserve the desired
 * groups order.
 */
function buildGroupsTemplate(groups) {
  return groups.reduce((acc, group) => {
    acc[group] = []
    return acc
  }, {})
}

/**
 * Returns promise to list of static docs with it's content.
 */
function getListOfStaticDocs(staticDocs) {
  return Promise.all(
    docsConfig.staticDocs.map(staticDoc => {
      return fsp
        .readFile(staticDoc.path)
        .then(docContent => docContent.toString())
        .then(content => Object.assign({ content }, staticDoc))
    })
  )
}

function paramsToTree(dirtyParams) {
  if (!dirtyParams) {
    return null
  }

  const params = cloneDeep(dirtyParams)

  const paramIndices = params.reduce((result, { name }, index) => {
    result[name] = index
    return result
  }, {})

  return params
    .map((param, index) => {
      const { name, isProperty } = param

      const indexOfDot = name.indexOf('.')

      if (indexOfDot >= 0 && !isProperty) {
        const parentIndex = paramIndices[name.substring(0, indexOfDot)]
        const parent = params[parentIndex]

        param.name = name.substring(indexOfDot + 1)
        param.isProperty = true
        if (!parent.props) {
          parent.props = [param]
        } else {
          parent.props.push(param)
        }
      }

      return param
    })
    .filter(param => !param.isProperty)
}

function generateUsage(name) {
  const fileName = snakeCase(name)
  return {
    commonjs: {
      title: 'CommonJS',
      code: `var ${name} = require('date-fns/${fileName}')`
    },

    umd: {
      title: 'UMD',
      code: `var ${name} = dateFns.${name}`
    },

    es2015: {
      title: 'ES 2015',
      code: `import ${name} from 'date-fns/${fileName}'`
    }
  }
}

function generateSyntaxString (name, args) {
  const argsString = args
    .map(arg => arg.optional ? `[${arg.name}]` : arg.name)
    .join(', ')
  return `${name}(${argsString})`
}
