(function() {
  // extracted from http://geeklad.com/remove-stop-words-in-javascript
  function removeStopWords(str, stop_words){
    var words = str.match(/[^\s]+|\s+[^\s+]$/g);
    var x,y = 0;

    for(x=0; x < words.length; x++) {
      // For each word, check all the stop words
      for(y=0; y < stop_words.length; y++) {
        // Get the current word
        var word = words[x];

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

          // Remove the word from the keywords
          str = str.replace(regex, " ");
        }
      }
    }
    return str.replace(/^\s+|\s+$/g, "");
  }


  function TicketSerializer(ticket, stop_words){
    this.ticket = ticket;
    this.stop_words = stop_words;

    this.toSubjectSearchQuery = function(){
      return removeStopWords(this.ticket.subject(), this.stop_words);
    };

    this.toTagsSearchQuery = function(){
      return _.reduce(this.ticket.tags(),
                      function(memo, tag){
                        memo.push('tags:'+tag);
                        return memo;
                      },
                      []).join(' ');
    };
  }

  function EntriesSerializer(entries, baseUrl){
    this.entries = entries;
    this.baseUrl = baseUrl;

    this.toList = function(){
      return _.reduce(this.entries, function(memo, entry){
        memo.push({
          id: entry.id,
          url: this.baseUrl + "entries/" + entry.id,
          title: entry.title
        });
        return memo;
      }, [], this);
    };
  }

  function EntrySet() {
    this.self = [];

     this.push = function(array) {
      var newSelf = _.union(this.self, array);

      this.self = _.uniq(newSelf, true, function(i){return i.id;});

      return this.self;
    };

    this.toArray = function(){ return this.self; };
  }

  return {
    doneLoading: false,
    entries: new EntrySet(),
    events: {
      // APP EVENTS
      'app.activated'           : 'initializeIfReady',
      'ticket.status.changed'   : 'initializeIfReady',
      // AJAX EVENTS
      'search.done'             : 'searchDone',
      // DOM EVENTS
      'dragend ul.entries li'   : function(event){
        event.preventDefault();

        return this.appendLinkToComment(this.$(event.currentTarget).data('url'));
      }
    },

    requests: {
      search: function(query){
        return {
          url: '/api/v2/search.json?query=type:topic ' + query,
          type: 'GET'
        };
      }
    },

    initializeIfReady: function(data){
      if (data.firstLoad &&
          this.canInitialize()){

        this.initialize();
        this.doneLoading = true;
      }
    },

    canInitialize: function(){
      return (!this.doneLoading &&
              this.ticket() &&
              this.ticket().id());
    },

    initialize: function(){
      var serializer = new TicketSerializer(this.ticket(), this.stop_words());

      if (!_.isEmpty(this.ticket().tags()))
        this.ajax('search', serializer.toTagsSearchQuery());

      return this.ajax('search', serializer.toSubjectSearchQuery());
    },

    searchDone: function(data) {
      this.entries.push(data.results);

      return this.switchTo('list', {
        entries: new EntriesSerializer(this.entries.toArray(), this.baseUrl()).toList()
      });
    },

    baseUrl: function(){
      return "https://" + this.currentAccount().subdomain() + ".zendesk.com/";
    },

    appendLinkToComment: function(url){
      return this.comment().text(this.comment().text() + '\n' + url);
    },

    stop_words: function(){
      return _.map(this.I18n.t("stop_words").split(','), function(word) { return word.trim(); });
    }
  };

}());
