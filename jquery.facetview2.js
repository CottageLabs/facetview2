/*
 * jquery.facetview2.js
 *
 * displays faceted browse results by querying a specified elasticsearch index
 *
 * http://cottagelabs.com
 *
 */

/*****************************************************************************
 * JAVASCRIPT PATCHES
 ****************************************************************************/

// Deal with indexOf issue in <IE9
// provided by commentary in repo issue - https://github.com/okfn/facetview/issues/18
if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(searchElement /*, fromIndex */ ) {
        "use strict";
        if (this == null) {
            throw new TypeError();
        }
        var t = Object(this);
        var len = t.length >>> 0;
        if (len === 0) {
            return -1;
        }
        var n = 0;
        if (arguments.length > 1) {
            n = Number(arguments[1]);
            if (n != n) { // shortcut for verifying if it's NaN
                n = 0;
            } else if (n != 0 && n != Infinity && n != -Infinity) {
                n = (n > 0 || -1) * Math.floor(Math.abs(n));
            }
        }
        if (n >= len) {
            return -1;
        }
        var k = n >= 0 ? n : Math.max(len - Math.abs(n), 0);
        for (; k < len; k++) {
            if (k in t && t[k] === searchElement) {
                return k;
            }
        }
        return -1;
    }
}

/*****************************************************************************
 * UTILITIES
 ****************************************************************************/

// first define the bind with delay function from (saves loading it separately) 
// https://github.com/bgrins/bindWithDelay/blob/master/bindWithDelay.js
(function($) {
    $.fn.bindWithDelay = function( type, data, fn, timeout, throttle ) {
        var wait = null;
        var that = this;

        if ( $.isFunction( data ) ) {
            throttle = timeout;
            timeout = fn;
            fn = data;
            data = undefined;
        }

        function cb() {
            var e = $.extend(true, { }, arguments[0]);
            var throttler = function() {
                wait = null;
                fn.apply(that, [e]);
            };

            if (!throttle) { clearTimeout(wait); }
            if (!throttle || !wait) { wait = setTimeout(throttler, timeout); }
        }

        return this.bind(type, data, cb);
    };
})(jQuery);

// add extension to jQuery with a function to get URL parameters
jQuery.extend({
    getUrlVars: function() {
        var params = new Object;
        var url = window.location.href;
        var anchor = undefined;
        if (url.indexOf("#") > -1) {
            anchor = url.slice(url.indexOf('#'));
            url = url.substring(0, url.indexOf('#'));
        }
        var hashes = url.slice(window.location.href.indexOf('?') + 1).split('&');
        for ( var i = 0; i < hashes.length; i++ ) {
            var hash = hashes[i].split('=');
            if ( hash.length > 1 ) {
                var newval = unescape(hash[1]);
                if ( newval[0] == "[" || newval[0] == "{" ) {
                    // if it looks like a JSON object in string form...
                    // remove " (double quotes) at beginning and end of string to make it a valid 
                    // representation of a JSON object, or the parser will complain
                    newval = newval.replace(/^"/,"").replace(/"$/,"");
                    var newval = JSON.parse(newval);
                }
                params[hash[0]] = newval;
            }
        }
        if (anchor) {
            params['facetview_url_anchor'] = anchor;
        }
        
        //alert(JSON.stringify(params))
        return params;
    },
    getUrlVar: function(name){
        return jQuery.getUrlVars()[name];
    }
});

function safeId(s) {
    return s.replace(/\./gi,'_').replace(/\:/gi,'_')
}

/******************************************************************
 * DEFAULT RENDER FUNCTIONS
 *****************************************************************/

function theFacetview(options) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * id: facetview - main div in which the facetview functionality goes
     * id: facetview_filters - div where the facet filters will be displayed
     * id: facetview_rightcol - the main window for result display (doesn't have to be on the right)
     * class: facetview_search_options_container - where the search bar and main controls will go
     * id : facetview_selectedfilters - where we summarise the filters which have been selected
     * class: facetview_metadata - where we want paging to go
     * id: facetview_results - the table id for where the results actually go
     */

    // the facet view object to be appended to the page
    var thefacetview = '<div id="facetview"><div class="row-fluid">';
    
    // if there are facets, give them span3 to exist, otherwise, take up all the space
    if ( options.facets.length > 0 ) {
        thefacetview += '<div class="span3"><div id="facetview_filters" style="padding-top:45px;"></div></div>';
        thefacetview += '<div class="span9" id="facetview_rightcol">';
    } else {
        thefacetview += '<div class="span12" id="facetview_rightcol">';
    }
    
    // make space for the search options container at the top
    thefacetview += '<div class="facetview_search_options_container"></div>';
    
    // make space for the selected filters
    thefacetview += '<div style="clear:both;" class="btn-toolbar" id="facetview_selectedfilters"></div>';
    
    // make space at the top for the pager
    thefacetview += '<div class="facetview_metadata" style="margin-top:20px;"></div>';
    
    // insert the table within which the results actually will go
    thefacetview += '<table class="table table-striped table-bordered" id="facetview_results"></table>'
    
    // make space at the bottom for the pager
    thefacetview += '<div class="facetview_metadata"></div>';
    
    // close off all the big containers and return
    thefacetview += '</div></div></div>';
    return thefacetview
}

function searchOptions(options) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_startagain - reset the search parameters
     * class: facetview_pagesize - size of each result page
     * class: facetview_order - ordering direction of results
     * class: facetview_orderby - list of fields which can be ordered by
     * class: facetview_searchfield - list of fields which can be searched on
     * class: facetview_freetext - input field for freetext search
     */
    
    // initial button group of search controls
    var thefacetview = '<div class="btn-group" style="display:inline-block; margin-right:5px;"> \
        <a class="btn btn-small facetview_startagain" title="clear all search settings and start again" href=""><i class="icon-remove"></i></a> \
        <a class="btn btn-small facetview_pagesize" title="change result set size" href="#"></a>';
        
    if (options.search_sortby.length > 0) {
        thefacetview += '<a class="btn btn-small facetview_order" title="current order descending. Click to change to ascending" \
            href="desc"><i class="icon-arrow-down"></i></a>';
    }
    thefacetview += '</div>';
    
    // selection for search ordering
    if (options.search_sortby.length > 0) {
        thefacetview += '<select class="facetview_orderby" style="border-radius:5px; \
            -moz-border-radius:5px; -webkit-border-radius:5px; width:100px; background:#eee; margin:0 5px 21px 0;"> \
            <option value="">order by ... relevance</option>';
        
        for (var each = 0; each < options.search_sortby.length; each++) {
            var obj = options.search_sortby[each];
            var sortoption = '';
            if ($.type(obj['field']) == 'array') {
                sortoption = sortoption + '[';
                sortoption = sortoption + "'" + obj['field'].join("','") + "'";
                sortoption = sortoption + ']';
            } else {
                sortoption = obj['field'];
            }
            thefacetview += '<option value="' + sortoption + '">' + obj['display'] + '</option>';
        };
        thefacetview += '</select>';
    }
    
    // select box for fields to search on
    if ( options.searchbox_fieldselect.length > 0 ) {
        thefacetview += '<select class="facetview_searchfield" style="border-radius:5px 0px 0px 5px; \
            -moz-border-radius:5px 0px 0px 5px; -webkit-border-radius:5px 0px 0px 5px; width:100px; margin:0 -2px 21px 0; background:#ecf4ff;">';
        thefacetview += '<option value="">search all</option>';
        
        for (var each = 0; each < options.searchbox_fieldselect.length; each++) {
            var obj = options.searchbox_fieldselect[each];
            thefacetview += '<option value="' + obj['field'] + '">' + obj['display'] + '</option>';
        };
        thefacetview += '</select>';
    };
    
    // text search box
    thefacetview += '<input type="text" class="facetview_freetext span4" style="display:inline-block; margin:0 0 21px 0; background:#ecf4ff;" name="q" \
        value="" placeholder="search term" />';
    
    // share and save link
    if (options.sharesave_link) {
        thefacetview += '<a class="btn facetview_sharesave" title="share or save this search" style="margin:0 0 21px 5px;" href=""><i class="icon-share-alt"></i></a>';
        thefacetview += '<div class="facetview_sharesavebox alert alert-info" style="display:none;"> \
            <button type="button" class="facetview_sharesave close">×</button> \
            <p>Share or save this search:</p> \
            <textarea class="facetview_sharesaveurl" style="width:100%;height:100px;">' + shareableUrl(options) + '</textarea> \
            </div>';
    }
    return thefacetview
}

function facetList(options) {
    if (options.facets.length > 0) {
        var filters = options.facets;
        var thefilters = '';
        for (var idx = 0; idx < filters.length; idx++) {
            var facet = filters[idx]
            var type = facet.type ? facet.type : "term"
            if (type === "term") {
                thefilters += options.render_term_facet(facet, options)
            }
        };
        return thefilters
    };
    return ""
};

function renderTermFacet(facet, options) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * id: facetview_filter_<safe filtername> - table for the specific filter
     * class: facetview_morefacetvals - for increasing the size of the facet
     * id: facetview_facetvals_<safe filtername> - id of anchor for changing facet vals
     * class: facetview_sort - for changing the facet ordering
     * id: facetview_sort_<safe filtername> - id of anchor for changing sorting
     * class: facetview_or - for changing the default operator
     * id: facetview_or_<safe filtername> - id of anchor for changing AND/OR operator
     *
     * each anchor must also have href="<filtername>"
     */
     
    // full template for the facet - we'll then go on and do some find and replace
    var filterTmpl = '<table id="facetview_filter_{{FILTER_NAME}}" class="facetview_filters table table-bordered table-condensed table-striped"> \
        <tr><td><a class="facetview_filtershow" title="filter by {{FILTER_DISPLAY}}" rel="{{FILTER_NAME}}" \
        style="color:#333; font-weight:bold;" href=""><i class="icon-plus"></i> {{FILTER_DISPLAY}} \
        </a> \
        <div class="btn-group facetview_filteroptions" style="display:none; margin-top:5px;"> \
            <a class="btn btn-small facetview_morefacetvals" id="facetview_facetvals_{{FILTER_NAME}}" title="filter list size" href="{{FILTER_EXACT}}">0</a> \
            <a class="btn btn-small facetview_sort" id="facetview_sort_{{FILTER_NAME}}" title="filter value order" href="{{FILTER_EXACT}}"></a> \
            <a class="btn btn-small facetview_or" id="facetview_or_{{FILTER_NAME}}" href="{{FILTER_EXACT}}">OR</a> \
        </div> \
        </td></tr> \
        </table>';
    
    // put the name of the field into FILTER_NAME and FILTER_EXACT
    filterTmpl = filterTmpl.replace(/{{FILTER_NAME}}/g, safeId(facet['field'])).replace(/{{FILTER_EXACT}}/g, facet['field']);
    
    // set the display name of the facet in FILTER_DISPLAY
    if ('display' in facet) {
        filterTmpl = filterTmpl.replace(/{{FILTER_DISPLAY}}/g, facet['display']);
    } else {
        filterTmpl = filterTmpl.replace(/{{FILTER_DISPLAY}}/g, facet['field']);
    };
    
    return filterTmpl
}

/******************************************************************
 * DEFAULT CALLBACKS
 *****************************************************************/
 
function postInit(options) {}
function preSearch(options) {}
function postSearch(options) {}
function preRender(options) {}
function postRender(options) {}

/******************************************************************
 * URL MANAGEMENT
 *****************************************************************/

// FIXME: we won't be able to write this until we better understand how url options work
function shareableUrl(options) {
    return 'http://' + window.location.host + window.location.pathname + '?source=FIXME'
}


var elasticsearch_special_chars = ['(', ')', '{', '}', '[', ']', '^' , ':', '/'];

// now the facetview function
(function($){
    $.fn.facetview = function(options) {
    
        /**************************************************************
         * handle the incoming options, default options and url parameters
         *************************************************************/
         
        // specify all the default options
        var defaults = {
            // view parameters
            "facets" : [],
            "page_size" : 10,
            "from" : 0,
            "search_sortby" : [],
            "searchbox_fieldselect" : [],
            "sharesave_link" : true,
            "sort" : [],
            "searchfield" : "",
            "q" : "",
            "default_facet_size" : 10,
            "default_facet_operator" : "AND",
            "default_facet_order" : "count",
            
            // behaviours
            "freetext_submit_delay" : 800,
            "initialsearch" : true,
            
            // render parameters
            "render_the_facetview" : theFacetview,
            "render_search_options" : searchOptions,
            "render_facet_list" : facetList,
            "render_term_facet" : renderTermFacet,
            
            // callbacks
            "post_init_callback" : postInit,
            "pre_search_callback" : preSearch,
            "post_search_callback" : postSearch,
            "pre_render_callback" : preRender,
            "post_render_callback" : postRender
        }
        
        // extend the defaults with the provided options
        var provided_options = $.extend(defaults, options);
        
        // FIXME: we will also need to deal with options which come from the URL
        var url_options = $.getUrlVars();
        
        // set the externally facing facetview options
        $.fn.facetview.options = $.extend(provided_options, url_options);
        var options = $.fn.facetview.options;
        
        /******************************************************************
         * OPTIONS MANAGEMENT
         *****************************************************************/

        function uiFromOptions() {
            // set the current page size
            setUIPageSize({size: options.page_size})
            
            // set the search order
            // FIXME: note that this interface only supports single field ordering
            sorting = options.sort
            for (var i in sorting) {
                var so = sorting[i]
                for (var field in so) {
                    var dir = so[field]["order"]
                    setUIOrder({order: dir})
                    setUIOrderBy({orderby: field})
                    break
                }
                break
            }
            
            // set the search field
            setUISearchField({field : options.searchfield})
            
            // set the search string
            setUISearchString({q: options.q})
            
            // for each facet, set the facet size, order and and/or status
            for (var i in options.facets) {
                var f = options.facets[i]
                setUIFacetVals({facet : f})
                setUIFacetSort({facet : f})
                setUIFacetAndOr({facet : f})
            }
        }

        
        /**************************************************************
         * functions for managing search option events
         *************************************************************/
        
        /////// paging /////////////////////////////////
        
        // adjust how many results are shown
        function clickPageSize(event) {
            event.preventDefault();
            var newhowmany = prompt('Currently displaying ' + options.page_size + 
                ' results per page. How many would you like instead?');
            if (newhowmany) {
                options.page_size = parseInt(newhowmany);
                options.from = 0;
                setUIPageSize(options.page_size);
                dosearch();
            }
        };
        
        // set the UI to present the given page size
        function setUIPageSize(params) {
            var size = params.size
            $('.facetview_pagesize', obj).html(size);
        }
        
        /////// start again /////////////////////////////////
        
        // erase the current search and reload the window
        function clickStartAgain(event) {
            event.preventDefault();
            var base = window.location.href.split("?")[0]
            window.location.replace(base);
        }
        
        /////// search ordering /////////////////////////////////
        
        function clickOrder(event) {
            event.preventDefault();
            
            // switch the sort options around
            if ($(this).attr('href') == 'desc') {
                setUIOrder({order: "asc"})
            } else {
                setUIOrder({order: "desc"})
            };
            
            // synchronise the new sort with the options
            saveSortOption();
            
            // reset the cursor and issue a search
            options.from = 0;
            dosearch();
        }
        
        function changeOrderBy(event) {
            event.preventDefault()
            
            // synchronise the new sort with the options
            saveSortOption();
            
            // reset the cursor and issue a search
            options.from = 0;
            dosearch();
        }
        
        // set the UI to present the given ordering
        function setUIOrder(params) {
            var order = params.order
            if (order == 'asc') {
                $('.facetview_order', obj).html('<i class="icon-arrow-up"></i>');
                $('.facetview_order', obj).attr('href','asc');
                $('.facetview_order', obj).attr('title','current order ascending. Click to change to descending');
            } else {
                $('.facetview_order', obj).html('<i class="icon-arrow-down"></i>');
                $('.facetview_order', obj).attr('href','desc');
                $('.facetview_order', obj).attr('title','current order descending. Click to change to ascending');
            };
        }
        
        // set the UI to present the order by field
        function setUIOrderBy(params) {
            var orderby = params.orderby
            $(".facetview_orderby", obj).val(orderby)
        }
        
        // save the sort options from the current UI
        function saveSortOption() {
            var sortchoice = $('.facetview_orderby', obj).val();
            if (sortchoice.length != 0) {
                var sorting = [];
                if (sortchoice.indexOf('[') === 0) {
                    sort_fields = JSON.parse(sortchoice.replace(/'/g, '"'));
                    for ( var each = 0; each < sort_fields.length; each++ ) {
                        sf = sort_fields[each];
                        sortobj = {}
                        sortobj[sf] = {'order': $('.facetview_order', obj).attr('href')};
                        sorting.push(sortobj);
                    }
                } else {
                    sortobj = {}
                    sortobj[sortchoice] = {'order': $('.facetview_order', obj).attr('href')};
                    sorting.push(sortobj);
                }
                
                options.sort = sorting;
            } else {
                sortobj = {}
                sortobj["_score"] = {'order': $('.facetview_order', obj).attr('href')};
                sorting = [sortobj]
                options.sort = sorting
            }
        }
        
        /////// search fields /////////////////////////////////
        
        // adjust the search field focus
        function changeSearchField(event) {
            event.preventDefault();
            var field = $(this).val();
            options.from = 0;
            options.searchfield = field
            dosearch();
        };
        
        // keyup in search box
        function keyupSearchText(event) {
            event.preventDefault()
            var q = $(this).val()
            options.q = q
            dosearch()
        }
        
        function setUISearchField(params) {
            var field = params.field
            $(".facetview_searchfield", obj).val(field)
        }
        
        function setUISearchString(params) {
            var q = params.q
            $(".facetview_freetext", obj).val(q)
        }
        
        /////// share save link /////////////////////////////////
        
        // show the current url with the result set as the source param
        function clickShareSave(event) {
            event.preventDefault();
            $('.facetview_sharesavebox', obj).toggle();
        };
        
        /**************************************************************
         * functions for handling facet events
         *************************************************************/
        
        // get the right facet from the options, based on the name
        function selectFacet(name) {
            for (var i = 0; i < options.facets.length; i++) {
                var item = options.facets[i];
                if ('field' in item) {
                    if (item['field'] === name) {
                        return item
                    }
                }
            }
        }
        
        // get the right facet element from the page
        function facetElement(prefix, name) {
            return $(prefix + safeId(name), obj)
        }
        
        /////// show/hide filter values /////////////////////////////////
        
        // show the filter values
        function clickFilterShow(event) {
            event.preventDefault();
            if ( $(this).hasClass('facetview_open') ) {
                $(this).children('i').removeClass('icon-minus');
                $(this).children('i').addClass('icon-plus');
                $(this).removeClass('facetview_open');
                $('#facetview_filter_' + $(this).attr('rel'), obj ).children().find('.facetview_filtervalue').hide();
                $(this).siblings('.facetview_filteroptions').hide();
            } else {
                $(this).children('i').removeClass('icon-plus');
                $(this).children('i').addClass('icon-minus');
                $(this).addClass('facetview_open');
                $('#facetview_filter_' + $(this).attr('rel'), obj ).children().find('.facetview_filtervalue').show();
                $(this).siblings('.facetview_filteroptions').show();
            }
        };
        
        /////// change facet length /////////////////////////////////
        
        // adjust how many results are shown
        function clickMoreFacetVals(event) {
            event.preventDefault();
            var morewhat = selectFacet($(this).attr("href"));
            if ('size' in morewhat ) {
                var currentval = morewhat['size'];
            } else {
                var currentval = options.default_facet_size;
            }
            var newmore = prompt('Currently showing ' + currentval + '. How many would you like instead?');
            if (newmore) {
                morewhat['size'] = parseInt(newmore);
                // $(this).html(newmore);
                setUIFacetVals({facet: morewhat})
                dosearch();
            }
        };
        
        function setUIFacetVals(params) {
            var facet = params.facet
            var size = options.default_facet_size
            if ("size" in facet) {
                size = facet["size"]
            }
            var el = facetElement("#facetview_facetvals_", facet["field"])
            el.html(size)
        }
        
        /////// sorting facets /////////////////////////////////
        
        function clickSort(event) {
            event.preventDefault();
            var sortwhat = selectFacet($(this).attr('href'));
            if (!("order" in sortwhat)) {
                sortwhat["order"] = options.default_facet_order
            }
            var cycle = {
                "term" : "reverse_term",
                "reverse_term" : "count",
                "count" : "reverse_count",
                "reverse_count": "term"
            }
            sortwhat["order"] = cycle[sortwhat["order"]]
            setUIFacetSort({facet: sortwhat})
            dosearch();
        };
        
        function setUIFacetSort(params) {
            var facet = params.facet
            var el = facetElement("#facetview_sort_", facet["field"])
            var order = options.default_facet_order
            if ("order" in facet) {
                order = facet["order"]
            }
            if (order === "reverse_term") {
                el.html('a-z <i class="icon-arrow-up"></i>');
            } else if (order === "count") {
                el.html('count <i class="icon-arrow-down"></i>');
            } else if (order === "reverse_count") {
                el.html('count <i class="icon-arrow-up"></i>');
            } else if (order === "term") {
                el.html('a-z <i class="icon-arrow-down"></i>');
            }
        }
        
        /////// AND vs OR on facet selection /////////////////////////////////
        
        // function to switch filters to OR instead of AND
        function clickOr(event) {
            event.preventDefault();
            var orwhat = selectFacet($(this).attr('href'));
            
            if (!("logic" in orwhat)) {
                orwhat["logic"] = options.default_facet_operator
            }
            var cycle = {
                "OR" : "AND",
                "AND" : "OR"
            }
            orwhat["logic"] = cycle[orwhat["logic"]]
            setUIFacetAndOr({facet: orwhat})
            dosearch();
        }
        
        function setUIFacetAndOr(params) {
            var facet = params.facet
            var el = facetElement("#facetview_or_", facet["field"])
            var logic = options.default_facet_operator
            if ("logic" in facet) {
                logic = facet["logic"]
            }
            if (logic === "OR") {
                el.css({'color':'#333'});
                
                // FIXME: resolve this when we get to the filter display
                $('.facetview_filterselected[rel="' + $(this).attr('href') + '"]', obj).addClass('facetview_logic_or');
            } else {
                el.css({'color':'#aaa'});
                
                // FIXME: resolve this when we got to the filter display
                $('.facetview_filterselected[rel="' + $(this).attr('href') + '"]', obj).removeClass('facetview_logic_or');
            }
        }
        
        /**************************************************************
         * search handling
         *************************************************************/
        
        function dosearch() {
        
        }
        
        /**************************************************************
         * build all of the fragments that we want to render
         *************************************************************/
        
        // render the facetview frame which will then be populated
        thefacetview = options.render_the_facetview(options)
        thesearchopts = options.render_search_options(options)
        thefacets = options.render_facet_list(options)
        
        
        // now create the plugin on the page for each div
        var obj = undefined;
        return this.each(function() {
            // get this object
            obj = $(this);
            
            // what to do when ready to go
            var whenready = function() {
                // append the facetview object to this object
                obj.append(thefacetview);
                
                // add the search controls
                $(".facetview_search_options_container").html(thesearchopts)
                
                // add the facets (empty at this stage)
                if (thefacets != "") {
                    $('#facetview_filters', obj).html(thefacets);
                }
                
                // populate all the page UI from the options
                uiFromOptions(options)
                
                // bind the search control triggers
                $(".facetview_startagain", obj).bind("click", clickStartAgain)
                $('.facetview_pagesize', obj).bind('click', clickPageSize);
                $('.facetview_order', obj).bind('click', clickOrder);
                $('.facetview_orderby', obj).bind('change', changeOrderBy);
                $('.facetview_searchfield', obj).bind('change', changeSearchField);
                $('.facetview_sharesave', obj).bind('click', clickShareSave);
                $('.facetview_freetext', obj).bindWithDelay('keyup', keyupSearchText, options.freetext_submit_delay);
                
                // bind the facet control triggers
                $('.facetview_filtershow', obj).bind('click', clickFilterShow);
                $('.facetview_morefacetvals', obj).bind('click', clickMoreFacetVals);
                $('.facetview_sort', obj).bind('click', clickSort);
                $('.facetview_or', obj).bind('click', clickOr);
                
                // if a post initialisation callback is provided, run it
                if (typeof options.post_init_callback === 'function') {
                    options.post_init_callback(options);
                }
                
                if (options.initialsearch) { dosearch() }
            };
            whenready();
        });
    }

    // facetview options are declared as a function so that they can be retrieved
    // externally (which allows for saving them remotely etc)
    $.fn.facetview.options = {};
    
})(jQuery);
