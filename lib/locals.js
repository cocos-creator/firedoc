
/**
 * The firedoc module
 * @module firedoc
 */

const _ = require('underscore');
const path = require('path');
const marked = require('marked');
const utils = require('./utils');


/**
 * The Theme Locals
 * @class Locals
 * @main Locals
 */
var Locals = {

  /**
   * @property {BuilderContext} context - Builder Context
   */
  context: null,

  /**
   * @property {Option} options - The options
   */
  options: {},

  /**
   * @property {AST} ast - The AST object
   */
  ast: {},

  /**
   * @property {Object} project - Get the project to export
   */
  get project () {
    var root = path.join(process.env.PWD, this.options.dest);
    var proj = this.ast.project;
    // TODO(Yorkie): support relative path
    // proj.logo = proj.logo;
    proj.root = root;
    proj.assets = path.join(root, '/assets');
    return proj;
  },

  /**
   * @property {Object} i18n - Get i18n object
   */
  get i18n () {
    try {
      var defaults = require(this.options.theme + '/i18n/en.json');
      var extra = {};
      if (this.options.lang) {
        extra = require(this.options.theme + '/i18n/' + this.options.lang + '.json');
      }
      var ret = _.extend(defaults, extra);
      ret.LANG = this.options.lang || 'en';
      return ret;
    } catch (e) {
      return {};
    }
  },

  /**
   * @property {Object} modules - Get modules object to export
   */
  get modules () {
    var self = this;
    return Object.keys(self.ast.modules).map(
      function (name) {
        var mod = self.ast.modules[name];
        mod = self.context.addFoundAt(mod);
        mod.description = self.parseCode(self.markdown(mod.description));
        mod.members = mod.members || [];
        mod.project = self.project;
        // mod.globals = self.metadata;
        mod.i18n = self.i18n;
        if (mod.module) {
          mod.namespace = mod.module + '.' + mod.name;
        } else {
          mod.namespace = mod.name;
        }
        return mod;
      }
    );
  },

  /**
   * @property {Object} classes - Get classes object to export
   */
  get classes () {
    var self = this;
    return Object.keys(self.ast.classes).map(
      function (name) {
        var clazz = self.ast.classes[name];
        if (clazz.isConstructor) {
          clazz.constructor = self.buildMember(clazz, true);
        }
        clazz = self.context.addFoundAt(clazz);
        clazz = self.appendClassToModule(clazz);
        clazz.namespace = (clazz.module || '') + '.' + clazz.name;
        clazz.description = self.parseCode(self.markdown(clazz.description));
        clazz.members = clazz.members || [];
        clazz.project = self.project;
        clazz.globals = self.meta;
        clazz.i18n = self.i18n;
        clazz.inheritance = self.getInheritanceTree(clazz);
        return clazz;
      }
    );
  },

  /**
   * @property {Object} files - Get files object to export
   */
  get files () {
    var self = this;
    return Object.keys(self.ast.files).map(
      function (name) {
        return self.ast.files[name];
      }
    );
  },

  /**
   * Parses file and line number from an item object and build's an HREF
   * @method addFoundAt
   * @param {Object} a The item to parse
   * @return {String} The parsed HREF
   */
  addFoundAt: function (a) {
    var self = this;
    var ext = this.options.markdown ? '.md' : '.html';
    if (a.file && a.line && !this.options.nocode) {
      a.foundAt = '../files/' + utils.filterFileName(a.file) + ext + '#l' + a.line;
      if (a.path) {
        a.foundAt = a.path + '#l' + a.line;
      }
    }
    return a;
  },

  /**
   * build the method name by its name and parameters
   *
   * @method getMethodName
   * @param {String} name - The function/method name
   * @param {Array} params - The function/method parameters list
   * @param {String} params.name - The name of the parameter
   */
  getMethodName: function (name, params) {
    return name + '(' + (params || []).map(function (v) {
      return v.name;
    }).join(', ') + ')';
  },

  /**
   * Parses `<pre><code>` tags and adds the __prettyprint__ `className` to them
   * @method _parseCode
   * @private
   * @param {HTML} html The HTML to parse
   * @return {HTML} The parsed HTML
   */
  parseCode: function (html) {
    html = html || '';
    html = html.replace(/<pre><code>/g, '<pre class="code prettyprint"><code>\n');
    html = html.replace(/\&gt;/g, '>');
    html = html.replace(/\&lt;/g, '<');
    return html;
  },

  /**
   * Wrapper around the Markdown parser so it can be normalized or even side stepped
   * @method markdown
   * @private
   * @param {String} data The Markdown string to parse
   * @return {HTML} The rendered HTML
   */
  markdown: function (data) {
    if (this.options.markdown) {
      return data;
    }
    var html = marked(data || '');
    //Only reprocess if helpers were asked for
    if (this.options.helpers || (html.indexOf('{{#crossLink') > -1)) {
      try {
        // markdown-it auto-escapes quotation marks (and unfortunately
        // does not expose the escaping function)
        html = html.replace(/&quot;/g, "\"");
        html = (Handlebars.compile(html))({});
      } catch (hError) {
        //Remove all the extra escapes
        html = html.replace(/\\{/g, '{').replace(/\\}/g, '}');
        console.warn('Failed to parse Handlebars, probably an unknown helper, skiped');
      }
    }
    return html;
  },

  /**
   * append the clazz to its module
   *
   * @method appendClassToModule
   * @param {Object} clazz - The class object
   * @param {String} clazz.module - The module name of this clazz object
   */
  appendClassToModule: function (clazz) {
    var mod = this.ast.modules[clazz.module];
    if (mod) {
      if (!_.isArray(mod.classes)) mod.classes = [];
      mod.classes.push(clazz);
    }
    return clazz;
  },

  /**
   * get class inheritance tree
   *
   * @method getClassInheritanceTree
   * @return {Object} return the inheritance tree object
   */
  getInheritanceTree: function (clazz) {
    var children = [];
    this.ast.inheritedMembers.forEach(function (inherit) {
      var at = inherit.indexOf(clazz.name);
      if (at > -1 && at < inherit.length) {
        var curr = children;
        for (var i = at + 1; i < inherit.length; i++) {
          var name = inherit[i];
          var temp = {'name': name, 'children': []};
          var needNewChild = true;
          var pos;

          for (pos = 0; pos < curr.length; pos++) {
            if (curr[pos].name === name) {
              needNewChild = false;
              curr = curr[pos].children;
              break;
            }
          }
          if (needNewChild) {
            if (inherit.length - 1 === i) {
              delete temp.children;
            }
            curr.push(temp);
            if (temp.children) {
              curr = curr[curr.length - 1].children;
            }
          }
        }
      }
    });
    return children;
  },

  /**
   * build the member
   *
   * @method buildMember
   * @param {Object} memeber - The member object
   * @param {Boolean} forceBeMethod - force make the build process be for method
   * @param {Object} parent - The parent context
   * @return {Object} returned member object
   */
  buildMember: function (member, forceBeMethod ,parent) {
    var self = this;
    member = self.addFoundAt(member);
    member.description = self.parseCode(self.markdown(member.description || ''));
    member.hasAccessType = !!member.access;
    member.readonly = member.readonly === '';
    member['final'] = member['final'] === '';
    member.type = member.type || 'Unknown';
    member.config = member.itemtype === 'config';
    member.i18n = self.i18n;

    if (!member.class && member.module) {
      member.parent = self.ast.modules[member.module];
    } else {
      member.parent = self.ast.classes[member.class];
    }

    if (this.options.markdown) {
      member.markdownLink = utils.markdownLink(member.itemtype + ':' + member.name);
    }
    if (member.example) {
      if (!_.isArray(member.example)) {
        member.example = [member.example];
      }
      member.example = member.example.map(function (v) {
        return self._parseCode(self.markdown(v.trim()))
      }).join('');
    }
    if (parent) {
      var classMod = member.submodule || member.module;
      var parentMod = parent.submodule || parent.module;
      if (classMod !== parentMod) {
        member.providedBy = classMod;
      }
    }
    if (member.itemtype === 'method' || forceBeMethod) {
      member.methodDisplay = self.getMethodName(member.name, member.params);
      member.hasParams = (member.params || []).length > 0;
      if (member['return']) {
        member.hasReturn = true;
        member.returnType = member['return'].type;
      } else {
        member.returnType = '';
      }
    }
    if (member.itemtype === 'attribute') {
      member.emit = self.options.attributesEmit;
    }
    return member;
  },

  /**
   * build the members
   *
   * @method buildMembers
   * @return {Boolean} always be true
   */
  buildMembers: function () {
    _.each(
      this.ast.members,
      function (member) {
        var parent;
        if (member.clazz) {
          parent = this.ast.classes[member.clazz];
        } else if (member.module) {
          parent = this.ast.modules[member.module];
        }
        if (!parent) return;
        if (!parent.members) {
          parent.members = [];
        }
        var item = this.buildMember(member, false, parent);
        parent.members.push(item);
      },
      this
    );
  },

  /**
   * Counter for stepping into merges
   * @private
   * @property _mergeCounter
   * @type Number
   */
  _mergeCounter: null,

  /**
   * Merge superclass data into a child class
   * @method mergeExtends
   * @param {Object} info The item to extend
   * @param {Array} members The list of items to merge in
   * @param {Boolean} first Set for the first call
   */
  mergeExtends: function (info, members, first, onmember) {
    var self = this;
    self._mergeCounter = (first) ? 0 : (self._mergeCounter + 1);

    if (self._mergeCounter === 100) {
      throw new Error('YUIDoc detected a loop extending class ' + info.name);
    }
    if (info.extends || info.uses) {
      var hasItems = {};
      hasItems[info.extends] = 1;
      if (info.uses) {
        info.uses.forEach(function (v) {
          hasItems[v] = 1;
        });
      }
      self.ast.members.forEach(function (v) {
        if (hasItems[v.class]) {
          if (!v.static) {
            var q, override = self.hasProperty(members, v);
            if (override === false) {
              //This method was extended from the parent class but not over written
              q = _.extend({}, v);
              q.extended_from = v.class;
              members.push(q);
            } else {
              //This method was extended from the parent and overwritten in this class
              q = _.extend({}, v);
              q = self.augmentData(q);
              members[override].overwritten_from = q;
            }
            if (typeof onmember === 'function') {
              onmember(q);
            }
          }
        }
      });
      if (self.ast.classes[info.extends]) {
        if (self.ast.classes[info.extends].extends || self.ast.classes[info.extends].uses) {
          members = self.mergeExtends(self.ast.classes[info.extends], members);
        }
      }
    }
    return members;
  },

  /**
   * generate expand function
   *
   * @method getExpandIterator
   * @private
   * @param {Object} parent - The object to be set
   */
  getExpandIterator: function (parent) {
    var pluralsMap = {
      'property': 'properties'
    };
    return function (item) {
      if (!item.itemtype) return;
      var plural = pluralsMap[item.itemtype];
      if (!plural) {
        plural = item.itemtype + 's';
      }
      if (!parent[plural]) {
        parent[plural] = [];
      }
      parent[plural].push(item);
    }
  },

  /**
   * extends members array
   *
   * @method extendMembers
   * @param {Object} meta - The meta object
   */
  extendMembers: function (meta) {
    _.each(
      meta.classes, 
      function (clazz) {
        var inherited = [];
        clazz.members = this.mergeExtends(clazz, clazz.members, true, function (member) {
          if (member.extendedFrom) inherited.push(member);
        });
        clazz.members.inherited = inherited;
      }, 
      this
    );
  },

  /**
   * extends modules
   *
   * @method expandMembersFromModules
   * @param {Object} meta - The meta object
   */
  expandMembersFromModules: function (meta) {
    _.each(
      meta.modules,
      function (mod) {
        mod.properties = [];
        mod.attributes = [];
        mod.methods = [];
        mod.events = [];
        mod.members.forEach(
          this.getExpandIterator(mod.members)
        );
      },
      this
    );
  },

  /**
   * extends members from classes
   *
   * @method expandMembersFromModules
   * @param {Object} meta - The meta object
   */
  expandMembersFromClasses: function (meta) {
    _.each(
      meta.classes,
      function (clazz) {
        clazz.members.forEach(
          this.getExpandIterator(clazz.members)
        );
        clazz.members.inherited = clazz.members.inherited || [];
        clazz.members.inherited.forEach(
          this.getExpandIterator(clazz.members.inherited)
        );
      },
      this
    );
  },

  /**
   * Create a locals object from context
   *
   * @method create
   * @param {BuilderContext} context - The `BuilderContext` instance
   */
  create: function (context) {
    this.context = context;
    this.options = context.options;
    this.ast = context.ast;

    // attach/build members to classes and modules
    this.buildMembers();

    var instance = utils.prepare([this.options.theme], this.project);
    instance.meta.classes = this.classes;
    instance.meta.modules = this.modules;
    instance.meta.files = this.files;
    instance.meta.i18n = this.i18n;
    instance.meta.globals = instance.meta;

    // merge extends
    this.extendMembers(instance.meta);
    this.expandMembersFromModules(instance.meta);
    this.expandMembersFromClasses(instance.meta);

    // build locals.js
    var locals;
    var meta = instance.meta;
    try {
      locals = require(this.options.theme + '/locals.js');
    } catch (e) {
      locals = function () {};
    }
    locals(meta.modules, meta.classes, meta);
    return instance;
  }

};

exports.Locals = Locals;