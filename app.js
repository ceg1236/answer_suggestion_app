(function() {
  return {
    defaultState: 'spinner',
    defaultNumberOfEntriesToDisplay: 10,
    categories: {},
    access_policy: {},
    urlRegex: /^https?:\/\/[^/]+\//,
    zendeskRegex: /^https:\/\/(.*?)\.(?:zendesk|zd-(?:dev|master|staging))\.com\//,
    DEFAULT_LOGO_URL: '/images/logo_placeholder.png',

    events: {
      // APP EVENTS
      'app.created': 'created',
      'ticket.subject.changed': _.debounce(function(){ this.initialize(); }, 500),

      // AJAX EVENTS
      'searchHelpCenter.done': 'searchHelpCenterDone',
      'searchWebPortal.done': 'searchWebPortalDone',
      'getBrands.done': 'getBrandsDone',
      'getCategories.done':'getCategoriesDone',
      'getHcArticle.done': 'getHcArticleDone',
      'getSectionAccessPolicy.done': 'getSectionAccessPolicyDone',
      'settings.done': 'settingsDone',

      // DOM EVENTS
      'zd_ui_change .brand-filter': 'processSearchFromInput',
      'click a.preview_link': 'previewLink',
      'dragend,click a.copy_link': 'copyLink',
      'dragend a.main': 'copyLink',
      'click .toggle-app': 'toggleAppContainer',
      'keyup .custom-search input': function(event){
        if (event.keyCode === 13) { return this.processSearchFromInput(); }
      },
      'click .custom-search .search-btn': 'processSearchFromInput'
    },

    requests: {
      settings: {
        url: '/api/v2/account/settings.json',
        type: 'GET'
      },

      getBrands: {
        url: '/api/v2/brands.json',
        type: 'GET'
      },

      getHcArticle: function(id) {
        return {
          url: helpers.fmt('/api/v2/help_center/articles/%@.json?include=translations', id),
          type: 'GET'
        };
      },

      getSectionAccessPolicy: function(sectionId) {
        return {
          url: helpers.fmt('/api/v2/help_center/sections/%@/access_policy.json', sectionId),
          type: 'GET'
        };
      },

      searchHelpCenter: function(query, category) {

        // var whoCanView = this.$('#access-dropdown').val();

        // if (whoCanView !== "Anyone") {
        //   console.log('restricted view');
        // }

        var currentUser = this.currentAccount();
        var url;
        if (this.isMultibrand) {
          url = '/api/v2/search.json';
        } else {
          url = '/api/v2/help_center/articles/search.json';
        }

        if (category === "All") {
          url = '/api/v2/help_center/articles/search.json';
        } else {
          url = '/api/v2/help_center/articles/search.json?query=' + query + '&category=' + this.categories[category];
        }

        var locale = this.currentUser().locale(),
            limit =  this.queryLimit(),
            finalquery = this.isMultibrand ? 'type:article ' + query : query;

        return {
          url: url,
          type: 'GET',
          data: {
            per_page: limit,
            locale:   locale,
            query:    finalquery,

          }
        };
      },

      getCategories: function(query) {

        return {
          url: '/api/v2/help_center/categories.json',
          type: 'GET',
        }
      },

      searchWebPortal: function(query){
        return {
          url: helpers.fmt('/api/v2/search.json?per_page=%@&query=%@ type:topic', this.queryLimit(), query),
          type: 'GET'
        };
      },

      fetchTopicsWithForums: function(ids){
        return {
          url: helpers.fmt('/api/v2/topics/show_many.json?ids=%@&include=forums', ids.join(',')),
          type: 'POST'
        };
      }
    },

    search: function(query, filter) {
      this.switchTo('spinner');

      if (this.setting('search_hc')) {
        this.ajax('searchHelpCenter', query, filter);
      } else {
        this.ajax('searchWebPortal', query);
      }
    },

    created: function() {
      this.isMultibrand = false;
      this.ajax('getBrands');
      this.ajax('getCategories');
      this.$('.custom-search').before(
        this.renderTemplate('access_template')
      );
      this.initialize();
    },

    initialize: function(){
      if (_.isEmpty(this.ticket().subject())) {
        return this.switchTo('no_subject');
      }

      this.ajax('settings').then(function() {
        this.search(this.subjectSearchQuery(), "All");
      }.bind(this));
    },

    settingsDone: function(data) {
      this.useMarkdown = data.settings.tickets.markdown_ticket_comments;
    },

    hcArticleLocaleContent: function(data) {
      var currentLocale = this.currentUser().locale(),
          translations = data.article.translations;

      var localizedTranslation = _.find(translations, function(translation) {
        return translation.locale.toLowerCase() === currentLocale.toLowerCase();
      });

      return localizedTranslation && localizedTranslation.body || translations[0].body;
    },

    renderAgentOnlyAlert: function() {
      var alert = this.renderTemplate('alert');
      this.$('#detailsModal .modal-body').prepend(alert);
    },

    isAgentOnlyContent: function(data) {
      return data.agent_only || data.access_policy && data.access_policy.viewable_by !== 'everybody';
    },

    getBrandsDone: function(data) {
      this.isMultibrand = data.brands.length > 1;
      if (this.isMultibrand) {
        var options = _.map(data.brands, function(brand) {
          return { value: brand.id, label: brand.name };
        });
        this.$('.custom-search').before(
          this.renderTemplate('brand_filter', { options: options })
        );

        this.$('.brand-filter').zdSelectMenu();
      }

      this.brandsInfo = _.object(_.map(data.brands, function(brand) {
        return [brand.name, brand.logo && brand.logo.content_url];
      }));
    },

    getCategoriesDone: function(data) {
      for(var i = 0; i < data.categories.length; i++) {
        var currentCategory = data.categories[i].name;
        this.categories[currentCategory] = data.categories[i].id;
      }
      this.$('.custom-search').before(
        this.renderTemplate('category_template', {categories: this.categories})
      );
    },

    getHcArticleDone: function(data) {
      var modalContent;
      if (data.article && data.article.section_id) {
        this.ajax('getSectionAccessPolicy', data.article.section_id);
      }

      if (data.diffDomain) {
        modalContent = data.body;
      } else {
        modalContent = this.hcArticleLocaleContent(data);
      }

      this.$('#detailsModal .modal-body .content-body').html(modalContent);
    },

    getSectionAccessPolicyDone: function(data) {
      // var whoCanView;
      // var sectionsFilteredByAccess = [];
      // console.log('secFilAcc', sectionsFilteredByAccess);
      // this.$('#access-dropdown').val() === "Agents and managers" ? whoCanView = 'staff' : whoCanView = 'signed_in_users';

      // // if (this.isAgentOnlyContent(data)) { this.renderAgentOnlyAlert(); }
      // if (data.access_policy.viewable_by === whoCanView) {
      //   console.log('access match!');
      //   return true;
      // }
    },

    filterByAccessPolicy: function(articles, access_policy) {
      var articlesFilteredByAccess = [];
      var self = this;
      for (var i = 0; i < articles.length; i++) {
        (function(i) {
          self.ajax('getSectionAccessPolicy', articles[i].section_id).done(function(res) {
            if ( res.access_policy.viewable_by === access_policy ) {
              console.log('pushin', articles[i]); 
              articlesFilteredByAccess.push(articles[i]);
            }
            console.log('filtered Arts', articlesFilteredByAccess);
          })
        })(i);
      }
      return articlesFilteredByAccess;
    },

    searchHelpCenterDone: function(data) {
      var results = data.results;
      var whoCanView;
      this.$('#access-dropdown').val() === "Agents and managers" ? whoCanView = 'staff' : whoCanView = 'signed_in_users';
      var self = this;

      var articlesFilteredByAccess = this.filterByAccessPolicy(results, whoCanView);
      console.log('list to format', articlesFilteredByAccess);
 
      if (this.isMultibrand) {
        var brand = this.$('.brand-filter').zdSelectMenu('value');
        if (brand !== 'any') {
          results = _.filter(data.results, function (article) {
            return article.brand_id == brand;
          });
        }
      }
      setTimeout(function() {
        self.renderList(self.formatHcEntries(articlesFilteredByAccess));
      }, 500);
    },

    searchWebPortalDone: function(data){
      if (_.isEmpty(data.results))
        return this.switchTo('no_entries');

      var topics = data.results,
          topicIds = _.map(topics, function(topic) { return topic.id; });

      this.ajax('fetchTopicsWithForums', topicIds)
        .done(function(data){
          var entries = this.formatEntries(topics, data);
          this.store('entries', entries);
          this.renderList(entries);
        });
    },

    renderList: function(data){
      if (_.isEmpty(data.entries)) {
        this.switchTo('no_entries');
      } else {
        this.switchTo('list', data);
        this.$('.brand-logo').tooltip();
      }
    },

    formatEntries: function(topics, result){

      var entries = _.inject(topics, function(memo, topic){
        var forum = _.find(result.forums, function(f) { return f.id == topic.forum_id; });
        var entry = {
          id: topic.id,
          url: helpers.fmt("%@entries/%@", this.baseUrl(), topic.id),
          title: topic.title,
          body: topic.body,
          agent_only: !!forum.access.match("agents only")
        };

        if ( !(this.setting('exclude_agent_only') && entry.agent_only)){
          memo.push(entry);
        }

        return memo;
      }, [], this);

      return { entries: entries.slice(0,this.numberOfDisplayableEntries()) };
    },

    formatHcEntries: function(result){

      var slicedResult = result.slice(0, this.numberOfDisplayableEntries());
      var entries = _.inject(slicedResult, function(memo, entry) {

        var title = entry.name,
            subdomain;

        var url = entry.html_url.replace(this.urlRegex, function(url) {
          var zendeskUrl = url.match(this.zendeskRegex);
          subdomain = zendeskUrl && zendeskUrl[1];
          return this.baseUrl(subdomain);
        }.bind(this));

        memo.push({
          id: entry.id,
          url: url,
          title: entry.name,
          subdomain: subdomain,
          body: entry.body,
          brandName: entry.brand_name,
          brandLogo: this.brandsInfo && this.brandsInfo[entry.brand_name] || this.DEFAULT_LOGO_URL,
          isMultibrand: this.isMultibrand
        });
        return memo;
      }, [], this);

      return { entries: entries };
    },

    processSearchFromInput: function() {
      var query = this.removePunctuation(this.$('.custom-search input').val());
      var filter = this.$('#category-dropdown').val();
      if (query && query.length) { this.search(query, filter); }
    },

    baseUrl: function(subdomain) {
      if (this.setting('custom_host')) {
        var host = this.setting('custom_host');
        if (host[host.length - 1] !== '/') { host += '/'; }
        return host;
      }
      return helpers.fmt("https://%@.zendesk.com/", subdomain || this.currentAccount().subdomain());
    },

    previewLink: function(event){
      event.preventDefault();
      var $link = this.$(event.target).closest('a');
      $link.parent().parent().parent().removeClass('open');
      var $modal = this.$("#detailsModal");
      $modal.html(this.renderTemplate('modal', {
        title: $link.closest('.entry').data('title'),
        link: $link.attr('href')
      }));
      $modal.modal();
      this.getContentFor($link);
    },

    copyLink: function(event) {
      event.preventDefault();
      var content = "";

      if (this.useMarkdown) {
        var title = event.target.title;
        var link = event.target.href;
        content = helpers.fmt("[%@](%@)", title, link);
      }
      else {
        if (this.setting('include_title')) {
          content = event.target.title + ' - ';
        }
        content += event.currentTarget.href;
      }
      return this.appendToComment(content);
    },

    renderTopicContent: function(id) {
      var topic = _.find(this.store('entries').entries, function(entry) {
        return entry.id == id;
      });
      this.$('#detailsModal .modal-body .content-body').html(topic.body);
      if (this.isAgentOnlyContent(topic)) { this.renderAgentOnlyAlert(); }
    },

    getContentFor: function($link) {
      if (this.setting('search_hc')) {
        if ($link.data('subdomain') !== this.currentAccount().subdomain()) {
          this.getHcArticleDone({ body: $link.data('articleBody'), diffDomain: true });
        } else {
          this.ajax('getHcArticle', $link.data('id'));
        }
      } else {
        this.renderTopicContent($link.data('id'));
      }
    },

    appendToComment: function(text){
      var old_text = _.isEmpty(this.comment().text()) ? '' : this.comment().text() + '\n';
      return this.comment().text( old_text + text);
    },

    stop_words: _.memoize(function(){
      return _.map(this.I18n.t("stop_words").split(','), function(word) { return word.trim(); });
    }),

    numberOfDisplayableEntries: function(){
      return this.setting('nb_entries') || this.defaultNumberOfEntriesToDisplay;
    },

    queryLimit: function(){
      // ugly hack to return more results than needed because we filter out agent only content
      if (this.setting('exclude_agent_only') && !this.setting('search_hc')) {
        return this.numberOfDisplayableEntries() * 2;
      } else {
        return this.numberOfDisplayableEntries();
      }
    },

    removeStopWords: function(str, stop_words){
      // Remove punctuation and trim
      str = this.removePunctuation(str);
      var words = str.match(/[^\s]+|\s+[^\s+]$/g);
      var x,y = 0;

      for(x=0; x < words.length; x++) {
        // For each word, check all the stop words
        for(y=0; y < stop_words.length; y++) {
          // Get the current word
          var word = words[x].replace(/\s+|[^a-z]+\'/ig, "");

          // Get the stop word
          var stop_word = stop_words[y];

          // If the word matches the stop word, remove it from the keywords
          if(word.toLowerCase() == stop_word) {
            // Build the regex
            var regex_str = "^\\s*"+stop_word+"\\s*$";// Only word
            regex_str += "|^\\s*"+stop_word+"\\s+";// First word
            regex_str += "|\\s+"+stop_word+"\\s*$";// Last word
            regex_str += "|\\s+"+stop_word+"\\s+";// Word somewhere in the middle

            var regex = new RegExp(regex_str, "ig");

            str = str.replace(regex, " ");
          }
        }
      }

      return str;
    },

    removePunctuation: function(str){
      return str.replace(/[\.,-\/#!$%\^&\*;:{}=\-_`~()]/g," ")
        .replace(/\s{2,}/g," ");
    },

    subjectSearchQuery: function(s){
      return this.removeStopWords(this.ticket().subject(), this.stop_words());
    },

    toggleAppContainer: function(){
      var $container = this.$('.app-container'),
      $icon = this.$('.toggle-app i');

      if ($container.is(':visible')){
        $container.hide();
        $icon.prop('class', 'icon-plus');
      } else {
        $container.show();
        $icon.prop('class', 'icon-minus');
      }
    }
  };
}());
