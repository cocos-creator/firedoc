
# firedoc 1.8.0

Fireball is the game engine for the future.


### File: ``

```js

/**
 * This is the __module__ description for the `YUIDoc` module.
 * ```
 * var options = {
 *   paths: [ './lib' ],
 *   outdir: './out'
 * };
 * ```
 *
 * @module firedoc
 * @submodule helpers
 * @submodule utils
 * @main firedoc
 */

const _ = require('underscore');
const path = require('path');
const fs = require('graceful-fs');
const readdirp = require('readdirp');
const debug = require('debug')('firedoc');

/**
 * Firedoc main class
 *
 * @class Firedoc
 * @constructor
 * @param config The config object
 */
function Firedoc (config) {
  if (!(this instanceof Firedoc)) {
    return new Firedoc(config);
  }

  /**
   * Holds the number of files that we are processing.
   * @property filecount
   * @type Boolean
   * @private
   */
  this.filecount = 0;
  /**
   * Holder for the list of files we are processing.
   * @property filemap
   * @type Object
   * @private
   */
  this.filemap = {};
  /**
   * Holder for the list of directories we are processing.
   * @property dirmap
   * @type Object
   * @private
   */
  this.dirmap = {};

  /**
   * Internal holder for configuration options.
   * @property options
   * @type Object
   * @private
   */
  this.options = {
    writeJSON: true,
    extensions: '.js',
    excludes: [
      '.git',
      '.svn',
      'CVS',
      'build_rollup_tmp',
      'build_tmp',
      'node_modules'
    ],
    norecurse: false,
    path: './',
    cwd: process.cwd(),
    http: false,
    dest: path.join(process.cwd(), 'out'),
    theme: path.join(__dirname, '../themes/default'),
    syntaxtype: 'js'
  };

  // setup options
  var cwd = config.cwd || this.options.cwd;
  if (fs.existsSync(cwd + '/package.json')) {
    var pkg = require(cwd + '/package.json');
    var firedocOption = pkg.firedoc;
    delete pkg.firedoc;
    this.options.project = pkg;
    this.options = _.extend(this.options, firedocOption);
  } else {
    this.options.path = config.path || this.options.path;
  }

  // setup options from config
  this.options.cwd = config.cwd || this.options.cwd;
  this.options.lang = config.lang || this.options.lang;
  this.options.http = config.http || this.options.http;
  this.options.dest = config.dest || this.options.dest;
  this.options.theme = config.theme || this.options.theme;
  this.options.markdown = config.markdown || this.options.markdown;
  this.options.syntaxtype = config.syntaxtype || this.options.syntaxtype;

  // if `markdown` enabled, set theme
  if (this.options.markdown === true) {
    this.options.theme = path.join(__dirname, '../themes/markdown');
  }
};
exports.Firedoc = Firedoc;

Firedoc.prototype = {

  /**
   * Walks the paths and parses the directory contents
   *
   * @method walk
   * @private
   */
  walk: function (callback) {
    var self = this;
    readdirp(
      {
        root: this.options.path,
        fileFilter: '*.@(js|rs|ts|coffee)',
        directoryFilter: self.options.excludes.map(
          function (ex) {
            return '!' + ex;
          }
        )
      }
    ).on('data', function (entry) {
      var text = fs.readFileSync(entry.fullPath, 'utf8');
      self.filecount += 1;
      self.filemap[entry.fullPath] = text.replace(/\r?\n|\r/g, '\n');
      self.dirmap[entry.fullPath] = entry.fullParentDir;
    }).on('end', callback);
  },

  lint: function (warnings) {
    var code = 0, count = 0;
    if (warnings && warnings.length) {
      code = 1;
      console.log('YUIDoc found', warnings.length, 'lint errors in your docs');
      warnings.forEach(function (item) {
        count++;
        console.log('#' + count, item.message, item.line + '\n');
      });
    }
  },

  /**
   * Process the config, walk the file tree and write out the JSON data.
   * @method build
   * @param {Function} callback
   */
  build: function (callback) {
    debug('Starting from: ' + this.options.path);
    var self = this;
    this.walk(function () {
      var parser = require('./docparser');
      var builder = require('./builder');
      var ast = parser.parse(
        self.options.syntaxtype,
        self.filemap,
        self.dirmap);

      debug('Parsing completed');
      if (self.options.lint) {
        debug('lint the warnings from ast');
        self.lint(ast.warnings);
        if (_.isFunction(callback)) return callback(ast.warnings);
      }
      if (self.options.parseOnly) {
        debug('skip the build because parse only');
        if (_.isFunction(callback)) callback(null, ast, self.options);
        return;
      }
      builder.compile(ast, self.options, callback);
    });
  }
};

```