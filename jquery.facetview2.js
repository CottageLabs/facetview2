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

function safeId(s) {
    return s.replace(/\./gi,'_').replace(/\:/gi,'_').replace(/@/, '_');
}

// get the right facet element from the page
function facetElement(prefix, name, context) {
    return $(prefix + safeId(name), context)
}

// get the right facet from the options, based on the name
function selectFacet(options, name) {
    for (var i = 0; i < options.facets.length; i++) {
        var item = options.facets[i];
        if ('field' in item) {
            if (item['field'] === name) {
                return item
            }
        }
    }
}

function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function ie8compat(o) {
    // Clean up all array options
    // IE8 interprets trailing commas as introducing an undefined
    // object, e.g. ["a", "b", "c",] means ["a", "b", "c", undefined]
    // in IE8. And maybe in older IE-s. So the user loading
    // facetview might have put trailing commas in their config, but
    // this will cause facetview to break in IE8 - so clean up!

    function delete_last_element_of_array_if_undefined(array, recurse) {
        var recurse = recurse || false;
        if ($.type(array) == 'array') {
            // delete the last item if it's undefined
            if (array.length > 0 && $.type(array[array.length - 1]) == 'undefined') {
                array.splice(array.length - 1, 1);
            }
        }
        if (recurse) {
            for ( var each = 0; each < array.length; each++ ) {
                if ($.type(array[each]) == 'array') {
                    delete_last_element_of_array_if_undefined(array[each], true);
                }
            }
        }
    }

    // first see if this clean up is necessary at all
    var test = ["a", "b", "c", ];  // note trailing comma, will produce ["a", "b", "c", undefined] in IE8 and ["a", "b", "c"] in every sane browser
    if ($.type(test[test.length - 1]) == 'undefined') {
        // ok, cleanup is necessary, go
        for (var key in o) {
            if (o.hasOwnProperty(key)) {
                var option = o[key];
                delete_last_element_of_array_if_undefined(option, true);
            }
        }
    }
}

/******************************************************************
 * DEFAULT CALLBACKS
 *****************************************************************/
 
///// the lifecycle callbacks ///////////////////////
function postInit(options, context) {}
function preSearch(options, context) {}
function postSearch(options, context) {}
function preRender(options, context) {}
function postRender(options, context) {}

/******************************************************************
 * URL MANAGEMENT
 *****************************************************************/

function shareableUrl(options, query_part_only, include_fragment) {
    var source = elasticSearchQuery({"options" : options, "include_facets" : options.include_facets_in_url, "include_fields" : options.include_fields_in_url})
    var querypart = "?source=" + encodeURIComponent(serialiseQueryObject(source))
    include_fragment = include_fragment === undefined ? true : include_fragment
    if (include_fragment) {
        var fragment_identifier = options.url_fragment_identifier ? options.url_fragment_identifier : "";
        querypart += fragment_identifier
    }
    if (query_part_only) {
        return querypart
    }
    return 'http://' + window.location.host + window.location.pathname + querypart
}

function getUrlVars() {
    var params = new Object;
    var url = window.location.href;
    var anchor = undefined;
    if (url.indexOf("#") > -1) {
        anchor = url.slice(url.indexOf('#'));
        url = url.substring(0, url.indexOf('#'));
    }
    var hashes = url.slice(window.location.href.indexOf('?') + 1).split('&');
    for (var i = 0; i < hashes.length; i++) {
        var hash = hashes[i].split('=');
        if (hash.length > 1) {
            var newval = decodeURIComponent(hash[1]);
            if (newval[0] == "[" || newval[0] == "{") {
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
        params['url_fragment_identifier'] = anchor;
    }
    
    return params;
}
 
/******************************************************************
 * FACETVIEW ITSELF
 *****************************************************************/

(function($){
    $.fn.facetview = function(options) {
    
        /**************************************************************
         * handle the incoming options, default options and url parameters
         *************************************************************/
         
        // all of the possible options that will be used in the facetview lifecycle
        // along with their documentation
        var defaults = {
            ///// elasticsearch parameters /////////////////////////////
            
            // the base search url which will respond to elasticsearch queries.  Generally ends with _search
            "search_url" : "http://localhost:9200/_search",
            
            // datatype for ajax requests to use - overall recommend using jsonp
            "datatype" : "jsonp",
            
            // if set, should be either * or ~
            // if *, * will be prepended and appended to each string in the freetext search term
            // if ~, ~ then ~ will be appended to each string in the freetext search term. 
            // If * or ~ or : are already in the freetext search term, no action will be taken. 
            "default_freetext_fuzzify": false, // or ~ or *
            
            // due to a bug in elasticsearch's clustered node facet counts, we need to inflate
            // the number of facet results we need to ensure that the results we actually want are
            // accurate.  This option tells us by how much.
            "elasticsearch_facet_inflation" : 100,
            
            ///// query aspects /////////////////////////////
            
            // list of fields to be returned by the elasticsearch query.  If omitted, full result set is returned
            "fields" : false, // or an array of field names
            
            // list of partial fields to be returned by the elasticsearch query.  If omitted, full result set is returned
            "partial_fields" : false, // or an array of partial fields

            // list of script fields to be executed.  Note that you should, in general, not pass actual scripts but
            // references to stored scripts in the back-end ES.  If not false, then an object corresponding to the
            // ES script_fields structure
            "script_fields" : false,
            
            // number of results to display per page (i.e. to retrieve per query)
            "page_size" : 10,
            
            // cursor position in the elasticsearch result set
            "from" : 0,
            
            // list of fields and directions to sort in.  Note that the UI only supports single value sorting
            "sort" : [], // or something like [ {"title" : {"order" : "asc"}} ]
            
            // field on which to focus the freetext search
            "searchfield" : "", // e.g. title.exact
            
            // freetext search string
            "q" : "",
            
            ///// facet aspects /////////////////////////////
            
            // The list of facets to be displayed and used to seed the filtering processes.
            // Facets are complex fields which can look as follows:
            /*
            {
                "field" : "<elasticsearch field>"                                   // field upon which to facet
                "display" : "<display name>",                                       // display name for the UI
                "type": "terms|range|geo_distance|statistical|date_histogram",      // the kind of facet this will be
                "open" : true|false,                                                // whether the facet should be open or closed (initially)
                "hidden" : true|false                                               // whether the facet should be displayed at all (e.g. you may just want the data for a callback)
                "disabled" : true|false                                             // whether the facet should be acted upon in any way.  This might be useful if you want to enable/disable facets under different circumstances via a callback
                "tooltip" : "<html to be displayed under the facet's tool tip>"     // if present the facet will present a link with the tooltip_text which would give the user some text or other functionality
                "tooltip_text" : "<text to use to open the tooltip>",               // sets the text of the tooltip link

                // terms facet only
                
                "size" : <num>,                                                     // how many terms should the facet limit to
                "logic" : "AND|OR",                                                 // Whether to AND or OR selected facets together when filtering
                "order" : "count|reverse_count|term|reverse_term",                  // which standard ordering to use for facet values
                "deactivate_threshold" : <num>,                                     // number of facet terms below which the facet is disabled
                "hide_inactive" : true|false,                                       // whether to hide or just disable the facet if below deactivate threshold
                "value_function" : <function>,                                      // function to be called on each value before display
                "controls" : true|false                                             // should the facet sort/size/bool controls be shown?
                "ignore_empty_string" : true|false                                  // should the terms facet ignore empty strings in display
                
                // range facet only
                
                "range" : [                                                         // list of ranges (in order) which define the filters
                    {"from" : <num>, "to" : <num>, "display" : "<display name>"}    // from = lower bound (inclusive), to = upper boud (exclusive)
                ],                                                                  // display = display name for this range
                "hide_empty_range" : true|false,                                    // if there are no results for a given range, should it be hidden
                
                // geo distance facet only
                
                "distance" : [                                                      // list of distances (in order) which define the filters
                    {"from" : <num>, "to" : <num>, "display" : "<display name>"}    // from = lower bound (inclusive), to = upper boud (exclusive)
                ],                                                                  // display = display name for this distance
                "hide_empty_distance" : true|false,                                 // if there are no results for a given distance, should it be hidden
                "unit" : "<unit of distance, e.g. km or mi>"                        // unit to calculate distances in (e.g. km or mi)
                "lat" : <latitude>                                                  // latitude from which to measure distances
                "lon" : <longitude>                                                 // longitude from which to measure distances

                // date histogram facet only
                "interval" : "year, quarter, month, week, day, hour, minute ,second"  // period to use for date histogram
                "sort" : "asc|desc",                                                // which ordering to use for date histogram
                "hide_empty_date_bin" : true|false                                  // whether to suppress display of date range with no values
                "short_display" : <number to display initially>                     // the number of values to show initially (note you should set size=false)

                // admin use only
                
                "values" : <object>                                                 // the values associated with a successful query on this facet
            }
            */
            "facets" : [],
            
            // user defined extra facets.  These must be pre-formatted for elasticsearch, and they will
            // simply be added to the query at query-time.
            "extra_facets": {},
            
            // default settings for each of the facet properties above.  If a facet lacks a property, it will
            // be initialised to the default
            "default_facet_type" : "terms",
            "default_facet_open" : false,
            "default_facet_hidden" : false,
            "default_facet_size" : 10,
            "default_facet_operator" : "AND",  // logic
            "default_facet_order" : "count",
            "default_facet_hide_inactive" : false,
            "default_facet_deactivate_threshold" : 0, // equal to or less than this number will deactivate the facet
            "default_facet_controls" : true,
            "default_hide_empty_range" : true,
            "default_hide_empty_distance" : true,
            "default_distance_unit" : "km",
            "default_distance_lat" : 51.4768,       // Greenwich meridian (give or take a few decimal places)
            "default_distance_lon" : 0.0,           //
            "default_date_histogram_interval" : "year",
            "default_hide_empty_date_bin" : true,
            "default_date_histogram_sort" : "asc",
            "default_short_display" : false,
            "default_ignore_empty_string" : false,      // because filtering out empty strings is less performant
            "default_tooltip" : false,
            "default_tooltip_text" : "learn more",


            ///// search bar configuration /////////////////////////////
            
            // list of options by which the search results can be sorted
            // of the form of a list of: { 'display' : '<display name>', 'field' : '<field to sort by>'},
            "search_sortby" : [],
            
            // list of options for fields to which free text search can be constrained
            // of the form of a list of: { 'display' : '<display name>', 'field' : '<field to search on>'},
            "searchbox_fieldselect" : [],
            
            // enable the share/save link feature
            "sharesave_link" : true,

            // provide a function which will do url shortening for the sharesave_link box
            "url_shortener" : false,
            
            // on free-text search, default operator for the elasticsearch query system to use
            "default_operator" : "OR",
            
            // enable the search button
            "search_button" : false,
            
            // amount of time between finishing typing and when a query is executed from the search box
            "freetext_submit_delay" : 500,
            
            ///// url configuration /////////////////////////////
            
            // FIXME: should we read in facets from urls, and if we do, what should we do about them?
            // should facets be included in shareable urls.  Turning this on makes them very long, and currently
            // facetview does not read those facets back in if the URLs are parsed
            "include_facets_in_url" : false,
            
            // FIXME: should we read in fields from urls, and if we do, what should we do about them?
            // should fields be included in shareable urls.  Turning this on makes them very long, and currently
            // facetview does not read those fields back in if the URLs are parsed
            "include_fields_in_url" : false,
            
            ///// selected filters /////////////////////////////
            
            // should the facet navigation show filters alongside other facet results which have not been selected
            "selected_filters_in_facet" : true,
            
            // should the "selected filters" area show the name of the facet from which the filter was selected
            "show_filter_field" : true,
            
            // should the "selected filters" area show the boolean logic used by the filter (taken from the facet.logic configuration)
            "show_filter_logic" : true,
            
            // FIXME: add support for pre-defined range filters
            // a set of pre-defined filters which will always be applied to the search.
            // Has the following structure, and works for terms filters only
            // { "<field>" : ["<list of values>"] }
            // requires a facet for the given field to be defined
            "predefined_filters" : {},
            
            // exclude any values that appear in pre-defined filters from any facets
            // This prevents configuration-set filters from ever being seen in a facet, but ensures that
            // they are always included when the search is carried out
            "exclude_predefined_filters_from_facets" : true,
            
            // current active filters
            // DO NOT USE - this is for tracking internal state ONLY
            "active_filters" : {},
            
            ///// general behaviour /////////////////////////////
            
            // after initialisation, begin automatically with a search
            "initialsearch" : true,
            
            // enable debug.  If debug is enabled, some technical information will be dumped to a 
            // visible textarea on the screen
            "debug" : false,
            
            // after search, the results will fade in over this number of milliseconds
            "fadein" : 800,
            
            // should the search url be synchronised with the browser's url bar after search
            // NOTE: does not work in some browsers.  See also share/save link option.
            "pushstate" : true,
            
            ///// render functions /////////////////////////////
            
            // for each render function, see the reference implementation for documentation on how they should work
            
            // render the frame within which the facetview sits
            "render_the_facetview" : theFacetview,
            
            // render the search options - containing freetext search, sorting, etc
            "render_search_options" : searchOptions,
            
            // render the list of available facets.  This will in turn call individual render methods
            // for each facet type
            "render_facet_list" : facetList,
            
            // render the terms facet, the list of values, and the value itself
            "render_terms_facet" : renderTermsFacet,                 // overall framework for a terms facet
            "render_terms_facet_values" : renderTermsFacetValues,    // the list of terms facet values
            "render_terms_facet_result" : renderTermsFacetResult,    // individual terms facet values
            
            // render the range facet, the list of values, and the value itself
            "render_range_facet" : renderRangeFacet,                // overall framework for a range facet
            "render_range_facet_values" : renderRangeFacetValues,   // the list of range facet values
            "render_range_facet_result" : renderRangeFacetResult,   // individual range facet values
            
            // render the geo distance facet, the list of values and the value itself
            "render_geo_facet" : renderGeoFacet,                // overall framework for a geo distance facet
            "render_geo_facet_values" : renderGeoFacetValues,   // the list of geo distance facet values
            "render_geo_facet_result" : renderGeoFacetResult,   // individual geo distance facet values

            // render the date histogram facet
            "render_date_histogram_facet" : renderDateHistogramFacet,
            "render_date_histogram_values" : renderDateHistogramValues,
            "render_date_histogram_result" : renderDateHistogramResult,
            
            // render any searching notification (which will then be shown/hidden as needed)
            "render_searching_notification" : searchingNotification,
            
            // render the paging controls
            "render_results_metadata" : basicPager, // or pageSlider
            
            // render a "results not found" message
            "render_not_found" : renderNotFound,
            
            // render an individual result record
            "render_result_record" : renderResultRecord,
            
            // render a terms filter interface component (e.g. the filter name, boolean operator used, and selected values)
            "render_active_terms_filter" : renderActiveTermsFilter,
            
            // render a range filter interface component (e.g. the filter name and the human readable description of the selected range)
            "render_active_range_filter" : renderActiveRangeFilter,
            
            // render a geo distance filter interface component (e.g. the filter name and the human readable description of the selected range)
            "render_active_geo_filter" : renderActiveGeoFilter,

            // render a date histogram/range interface component (e.g. the filter name and the human readable description of the selected range)
            "render_active_date_histogram_filter" : renderActiveDateHistogramFilter,
            
            ///// configs for standard render functions /////////////////////////////
            
            // if you provide your own render functions you may or may not want to re-use these
            "resultwrap_start":"<tr><td>",
            "resultwrap_end":"</td></tr>",
            "result_display" : [ [ {"pre" : "<strong>ID</strong>:", "field": "id", "post" : "<br><br>"} ] ],
            "results_render_callbacks" : {},
            
            ///// behaviour functions /////////////////////////////
            
            // called at the start of searching to display the searching notification
            "behaviour_show_searching" : showSearchingNotification,
            
            // called at the end of searching to hide the searching notification
            "behaviour_finished_searching" : hideSearchingNotification,
            
            // called after rendering a facet to determine whether it is visible/disabled
            "behaviour_facet_visibility" : setFacetVisibility,
            
            // called after rendering a facet to determine whether it should be open or closed
            "behaviour_toggle_facet_open" : setFacetOpenness,
            
            // called after changing the result set order to update the search bar
            "behaviour_results_ordering" : setResultsOrder,

            // called when the page size is changed
            "behaviour_set_page_size" : setUIPageSize,

            // called when the page order is changed
            "behaviour_set_order" : setUIOrder,

            // called when the field we order by is changed
            "behaviour_set_order_by" : setUIOrderBy,

            // called when the search field is changed
            "behaviour_set_search_field" : setUISearchField,

            // called when the search string is set or updated
            "behaviour_set_search_string" : setUISearchString,

            // called when the facet size has been changed
            "behaviour_set_facet_size" : setUIFacetSize,

            // called when the facet sort order has changed
            "behaviour_set_facet_sort" : setUIFacetSort,

            // called when the facet And/Or setting has been changed
            "behaviour_set_facet_and_or" : setUIFacetAndOr,

            // called when the selected filters have changed
            "behaviour_set_selected_filters" : setUISelectedFilters,

            // called when the share url is shortened/lengthened
            "behaviour_share_url" : setUIShareUrlChange,

            "behaviour_date_histogram_showall" : dateHistogramShowAll,
            "behaviour_date_histogram_showless" : dateHistogramShowLess,
            
            ///// lifecycle callbacks /////////////////////////////
            
            // the default callbacks don't have any effect - replace them as needed
            
            "post_init_callback" : postInit,
            "pre_search_callback" : preSearch,
            "post_search_callback" : postSearch,
            "pre_render_callback" : preRender,
            "post_render_callback" : postRender,
            
            ///// internal state monitoring /////////////////////////////
            
            // these are used internally DO NOT USE
            // they are here for completeness and documentation
            
            // is a search currently in progress
            "searching" : false,
            
            // the raw query object
            "queryobj" : false,
            
            // the raw data coming back from elasticsearch
            "rawdata" : false,
            
            // the parsed data from elasticsearch
            "data" : false,

            // the short url for the current search, if it has been generated
            "current_short_url" : false,

            // should the short url or the long url be displayed to the user?
            "show_short_url" : false
        };
        
        function deriveOptions() {
            // cleanup for ie8 purposes
            ie8compat(options);
            ie8compat(defaults);
            
            // extend the defaults with the provided options
            var provided_options = $.extend(defaults, options);
            
            // deal with the options that come from the url, which require some special treatment
            var url_params = getUrlVars();
            var url_options = {};
            if ("source" in url_params) {
                url_options = optionsFromQuery(url_params["source"])
            }
            if ("url_fragment_identifier" in url_params) {
                url_options["url_fragment_identifier"] = url_params["url_fragment_identifier"]
            }
            provided_options = $.extend(provided_options, url_options);
            
            // copy the _selected_operators data into the relevant facets
            // for each pre-selected operator, find the related facet and set its "logic" property
            var so = provided_options._selected_operators ? provided_options._selected_operators : {};
            for (var field in so) {
                if (so.hasOwnProperty(field)) {
                    var operator = so[field];
                    for (var i=0; i < provided_options.facets.length; i=i+1) {
                        var facet = provided_options.facets[i];
                        if (facet.field === field) {
                            facet["logic"] = operator
                        }
                    }
                }
            }
            if ("_selected_operators" in provided_options) {
                delete provided_options._selected_operators
            }
            
            // tease apart the active filters from the predefined filters
            if (!provided_options.predefined_filters) {
                provided_options["active_filters"] = provided_options._active_filters
                delete provided_options._active_filters
            } else {
                provided_options["active_filters"] = {};
                for (var field in provided_options._active_filters) {
                    if (provided_options._active_filters.hasOwnProperty(field)) {
                        var filter_list = provided_options._active_filters[field];
                        provided_options["active_filters"][field] = [];
                        if (!(field in provided_options.predefined_filters)) {
                            provided_options["active_filters"][field] = filter_list
                        } else {
                            // FIXME: this does not support pre-defined range queries
                            var predefined_values = provided_options.predefined_filters[field];
                            for (var i=0; i < filter_list.length; i=i+1) {
                                var value = filter_list[i];
                                if ($.inArray(value, predefined_values) === -1) {
                                    provided_options["active_filters"][field].push(value)
                                }
                            }
                        }
                        if (provided_options["active_filters"][field].length === 0) {
                            delete provided_options["active_filters"][field]
                        }
                    }
                }
            }
            
            // copy in the defaults to the individual facets when they are needed
            for (var i=0; i < provided_options.facets.length; i=i+1) {
                var facet = provided_options.facets[i];
                if (!("type" in facet)) { facet["type"] = provided_options.default_facet_type }
                if (!("open" in facet)) { facet["open"] = provided_options.default_facet_open }
                if (!("hidden" in facet)) { facet["hidden"] = provided_options.default_facet_hidden }
                if (!("size" in facet)) { facet["size"] = provided_options.default_facet_size }
                if (!("logic" in facet)) { facet["logic"] = provided_options.default_facet_operator }
                if (!("order" in facet)) { facet["order"] = provided_options.default_facet_order }
                if (!("hide_inactive" in facet)) { facet["hide_inactive"] = provided_options.default_facet_hide_inactive }
                if (!("deactivate_threshold" in facet)) { facet["deactivate_threshold"] = provided_options.default_facet_deactivate_threshold }
                if (!("controls" in facet)) { facet["controls"] = provided_options.default_facet_controls }
                if (!("hide_empty_range" in facet)) { facet["hide_empty_range"] = provided_options.default_hide_empty_range }
                if (!("hide_empty_distance" in facet)) { facet["hide_empty_distance"] = provided_options.default_hide_empty_distance }
                if (!("unit" in facet)) { facet["unit"] = provided_options.default_distance_unit }
                if (!("lat" in facet)) { facet["lat"] = provided_options.default_distance_lat }
                if (!("lon" in facet)) { facet["lon"] = provided_options.default_distance_lon }
                if (!("value_function" in facet)) { facet["value_function"] = function(value) { return value } }
                if (!("interval" in facet)) { facet["interval"] = provided_options.default_date_histogram_interval }
                if (!("hide_empty_date_bin" in facet)) { facet["hide_empty_date_bin"] = provided_options.default_hide_empty_date_bin }
                if (!("sort" in facet)) { facet["sort"] = provided_options.default_date_histogram_sort }
                if (!("disabled" in facet)) { facet["disabled"] = false }   // no default setter for this - if you don't specify disabled, they are not disabled
                if (!("short_display" in facet)) { facet["short_display"] = provided_options.default_short_display }
                if (!("ignore_empty_string" in facet)) { facet["ignore_empty_string"] = provided_options.default_ignore_empty_string }
                if (!("tooltip" in facet)) { facet["tooltip"] = provided_options.default_tooltip }
                if (!("tooltip_text" in facet)) { facet["tooltip_text"] = provided_options.default_tooltip_text }
            }
            
            return provided_options
        }
        
        /******************************************************************
         * OPTIONS MANAGEMENT
         *****************************************************************/

        function uiFromOptions() {
            // set the current page size
            options.behaviour_set_page_size(options, obj, {size: options.page_size});
            
            // set the search order
            // NOTE: that this interface only supports single field ordering
            var sorting = options.sort;

            for (var i = 0; i < sorting.length; i++) {
                var so = sorting[i];
                var fields = Object.keys(so);
                for (var j = 0; j < fields.length; j++) {
                    var dir = so[fields[j]]["order"];
                    options.behaviour_set_order(options, obj, {order: dir});
                    options.behaviour_set_order_by(options, obj, {orderby: fields[j]});
                    break
                }
                break
            }
            
            // set the search field
            options.behaviour_set_search_field(options, obj, {field : options.searchfield});
            
            // set the search string
            options.behaviour_set_search_string(options, obj, {q: options.q});
            
            // for each facet, set the facet size, order and and/or status
            for (var i=0; i < options.facets.length; i=i+1) {
                var f = options.facets[i];
                if (f.hidden) {
                    continue;
                }
                options.behaviour_set_facet_size(options, obj, {facet : f});
                options.behaviour_set_facet_sort(options, obj, {facet : f});
                options.behaviour_set_facet_and_or(options, obj, {facet : f});
            }
            
            // for any existing filters, render them
            options.behaviour_set_selected_filters(options, obj);
        }
        
        function urlFromOptions() {
            
            if (options.pushstate && 'pushState' in window.history) {
                var querypart = shareableUrl(options, true, true);
                window.history.pushState("", "search", querypart);
            }

            // also set the default shareable url at this point
            setShareableUrl()
        }
        
        /******************************************************************
         * DEBUG
         *****************************************************************/

        function addDebug(msg, context) {
            $(".facetview_debug", context).show().find("textarea").append(msg + "\n\n")
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
                options.behaviour_set_page_size(options, obj, {size: options.page_size});
                doSearch();
            }
        }

        /////// start again /////////////////////////////////
        
        // erase the current search and reload the window
        function clickStartAgain(event) {
            event.preventDefault();
            var base = window.location.href.split("?")[0];
            window.location.replace(base);
        }
        
        /////// search ordering /////////////////////////////////
        
        function clickOrder(event) {
            event.preventDefault();
            
            // switch the sort options around
            if ($(this).attr('href') == 'desc') {
                options.behaviour_set_order(options, obj, {order: "asc"})
            } else {
                options.behaviour_set_order(options, obj, {order: "desc"})
            };
            
            // synchronise the new sort with the options
            saveSortOption();
            
            // reset the cursor and issue a search
            options.from = 0;
            doSearch();
        }
        
        function changeOrderBy(event) {
            event.preventDefault();
            
            // synchronise the new sort with the options
            saveSortOption();
            
            // reset the cursor and issue a search
            options.from = 0;
            doSearch();
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
                        sortobj = {};
                        sortobj[sf] = {'order': $('.facetview_order', obj).attr('href')};
                        sorting.push(sortobj);
                    }
                } else {
                    sortobj = {};
                    sortobj[sortchoice] = {'order': $('.facetview_order', obj).attr('href')};
                    sorting.push(sortobj);
                }
                
                options.sort = sorting;
            } else {
                sortobj = {};
                sortobj["_score"] = {'order': $('.facetview_order', obj).attr('href')};
                sorting = [sortobj];
                options.sort = sorting
            }
        }
        
        /////// search fields /////////////////////////////////
        
        // adjust the search field focus
        function changeSearchField(event) {
            event.preventDefault();
            var field = $(this).val();
            options.from = 0;
            options.searchfield = field;
            doSearch();
        };
        
        // keyup in search box
        function keyupSearchText(event) {
            event.preventDefault();
            var q = $(this).val();
            options.from = 0;
            options.q = q;
            doSearch()
        }
        
        // click of the search button
        function clickSearch() {
            event.preventDefault();
            var q = $(".facetview_freetext", obj).val();
            options.from = 0;
            options.q = q;
            doSearch()
        }

        /////// share save link /////////////////////////////////
        
        // show the current url with the result set as the source param
        function clickShareSave(event) {
            event.preventDefault();
            $('.facetview_sharesavebox', obj).toggle();
        }

        function clickShortenUrl(event) {
            event.preventDefault();
            if (!options.url_shortener) {
                return;
            }

            if (options.current_short_url) {
                options.show_short_url = true;
                setShareableUrl();
                return;
            }

            function shortenCallback(short_url) {
                if (!short_url) {
                    return;
                }
                options.current_short_url = short_url;
                options.show_short_url = true;
                setShareableUrl();
            }

            var source = elasticSearchQuery({
                "options" : options,
                "include_facets" : options.include_facets_in_url,
                "include_fields" : options.include_fields_in_url
            });
            options.url_shortener(source, shortenCallback);
        }

        function clickLengthenUrl(event) {
            event.preventDefault();
            options.show_short_url = false;
            setShareableUrl();
        }

        function setShareableUrl() {
            if (options.sharesave_link) {
                if (options.current_short_url && options.show_short_url) {
                    $('.facetview_sharesaveurl', obj).val(options.current_short_url)
                } else {
                    var shareable = shareableUrl(options);
                    $('.facetview_sharesaveurl', obj).val(shareable);
                }
                options.behaviour_share_url(options, obj);
            }
        }
        
        /**************************************************************
         * functions for handling facet events
         *************************************************************/

        /////// show/hide filter values /////////////////////////////////
        
        // show the filter values
        function clickFilterShow(event) {
            event.preventDefault();
            
            var name = $(this).attr("href");
            var facet = selectFacet(options, name);
            var el = facetElement("#facetview_filter_", name, obj);
            
            facet.open = !facet.open;
            options.behaviour_toggle_facet_open(options, obj, facet)
        }
        
        /////// change facet length /////////////////////////////////
        
        // adjust how many results are shown
        function clickMoreFacetVals(event) {
            event.preventDefault();
            var morewhat = selectFacet(options, $(this).attr("href"));
            if ('size' in morewhat ) {
                var currentval = morewhat['size'];
            } else {
                var currentval = options.default_facet_size;
            }
            var newmore = prompt('Currently showing ' + currentval + '. How many would you like instead?');
            if (newmore) {
                morewhat['size'] = parseInt(newmore);
                options.behaviour_set_facet_size(options, obj, {facet: morewhat})
                doSearch();
            }
        }

        /////// sorting facets /////////////////////////////////
        
        function clickSort(event) {
            event.preventDefault();
            var sortwhat = selectFacet(options, $(this).attr('href'));
            
            var cycle = {
                "term" : "reverse_term",
                "reverse_term" : "count",
                "count" : "reverse_count",
                "reverse_count": "term"
            };
            sortwhat["order"] = cycle[sortwhat["order"]];
            options.behaviour_set_facet_sort(options, obj, {facet: sortwhat});
            doSearch();
        }
        
        /////// AND vs OR on facet selection /////////////////////////////////
        
        // function to switch filters to OR instead of AND
        function clickOr(event) {
            event.preventDefault();
            var orwhat = selectFacet(options, $(this).attr('href'));
            
            var cycle = {
                "OR" : "AND",
                "AND" : "OR"
            }
            orwhat["logic"] = cycle[orwhat["logic"]];
            options.behaviour_set_facet_and_or(options, obj, {facet: orwhat});
            options.behaviour_set_selected_filters(options, obj);
            doSearch();
        }

        ////////// All/Less date histogram values /////////////////////////////

        function clickDHAll(event) {
            event.preventDefault();
            var facet = selectFacet(options, $(this).attr('data-facet'));
            options.behaviour_date_histogram_showall(options, obj, facet);
        }

        function clickDHLess(event) {
            event.preventDefault();
            var facet = selectFacet(options, $(this).attr('data-facet'));
            options.behaviour_date_histogram_showless(options, obj, facet);
        }

        /////// facet values /////////////////////////////////
        
        function setUIFacetResults(facet) {
            var el = facetElement("#facetview_filter_", facet["field"], obj);

            // remove any stuff that is going to be overwritten
            el.find(".facetview_date_histogram_short", obj).remove();
            el.find(".facetview_date_histogram_full", obj).remove();
            el.find('.facetview_filtervalue', obj).remove();
            
            if (!("values" in facet)) {
                return
            }
            
            var frag = undefined;
            if (facet.type === "terms") {
                frag = options.render_terms_facet_values(options, facet)
            } else if (facet.type === "range") {
                frag = options.render_range_facet_values(options, facet)
            } else if (facet.type === "geo_distance") {
                frag = options.render_geo_facet_values(options, facet)
            } else if (facet.type === "date_histogram") {
                frag = options.render_date_histogram_values(options, facet)
            }
            // FIXME: how to display statistical facet?
            if (frag) {
                el.append(frag)
            }
            
            options.behaviour_toggle_facet_open(options, obj, facet);
            
            // FIXME: probably all bindings should come with an unbind first
            // enable filter selection
            $('.facetview_filterchoice', obj).unbind('click', clickFilterChoice);
            $('.facetview_filterchoice', obj).bind('click', clickFilterChoice);
            
            // enable filter removal
            $('.facetview_filterselected', obj).unbind('click', clickClearFilter);
            $('.facetview_filterselected', obj).bind('click', clickClearFilter);

            // enable all/less on date histograms
            $(".facetview_date_histogram_showless", obj).unbind("click", clickDHLess).bind("click", clickDHLess);
            $(".facetview_date_histogram_showall", obj).unbind("click", clickDHAll).bind("click", clickDHAll);

            // bind the tooltips
            $(".facetview_tooltip_more").unbind("click", clickTooltipMore).bind("click", clickTooltipMore);
            $(".facetview_tooltip_less").unbind("click", clickTooltipLess).bind("click", clickTooltipLess);
        }
        
        /////// selected filters /////////////////////////////////
        
        function clickFilterChoice(event) {
            event.preventDefault()
            
            var field = $(this).attr("data-field");
            var facet = selectFacet(options, field);
            var value = {};
            if (facet.type === "terms") {
                value = $(this).attr("data-value");
            } else if (facet.type === "range") {
                var from = $(this).attr("data-from");
                var to = $(this).attr("data-to");
                if (from) { value["from"] = from }
                if (to) { value["to"] = to }
            } else if (facet.type === "geo_distance") {
                var from = $(this).attr("data-from");
                var to = $(this).attr("data-to");
                if (from) { value["from"] = from }
                if (to) { value["to"] = to }
            } else if (facet.type === "date_histogram") {
                var from = $(this).attr("data-from");
                var to = $(this).attr("data-to");
                if (from) { value["from"] = from }
                if (to) { value["to"] = to }
            }
            // FIXME: how to handle clicks on statistical facet (if that even makes sense) or terms_stats facet
            
            // update the options and the filter display.  No need to update
            // the facet, as we'll issue a search straight away and it will
            // get updated automatically
            selectFilter(field, value);
            options.behaviour_set_selected_filters(options, obj);
            
            // reset the result set to the beginning and search again
            options.from = 0;
            doSearch();
        }
        
        function selectFilter(field, value) {
            // make space for the filter in the active filters list
            if (!(field in options.active_filters)) {
                options.active_filters[field] = []
            }
            
            var facet = selectFacet(options, field)
            
            if (facet.type === "terms") {
                // get the current values for that filter
                var filter = options.active_filters[field];
                if ($.inArray(value, filter) === -1 ) {
                    filter.push(value)
                }
            } else if (facet.type === "range") {
                // NOTE: we are implicitly stating that range filters cannot be OR'd
                options.active_filters[field] = value
            } else if (facet.type === "geo_distance") {
                // NOTE: we are implicitly stating that geo distance range filters cannot be OR'd
                options.active_filters[field] = value
            } else if (facet.type === "date_histogram") {
                // NOTE: we are implicitly stating that date histogram filters cannot be OR'd
                options.active_filters[field] = value
            }

            // FIXME: statistical facet support here?
        }
        
        function deSelectFilter(facet, field, value) {
            if (field in options.active_filters) {
                var filter = options.active_filters[field];
                if (facet.type === "terms") {
                    var index = $.inArray(value, filter);
                    filter.splice(index, 1);
                    if (filter.length === 0) {
                        delete options.active_filters[field]
                    }
                } else if (facet.type === "range") {
                    delete options.active_filters[field]
                } else if (facet.type === "geo_distance") {
                    delete options.active_filters[field]
                } else if (facet.type === "date_histogram") {
                    delete options.active_filters[field]
                }
                // FIXME: statistical facet support?
            }
        }

        function clickClearFilter(event) {
            event.preventDefault();
            if ($(this).hasClass("facetview_inactive_link")) {
                return
            }
            
            var field = $(this).attr("data-field");
            var facet = selectFacet(options, field);
            var value = {};
            if (facet.type === "terms") {
                value = $(this).attr("data-value");
            } else if (facet.type === "range") {
                var from = $(this).attr("data-from");
                var to = $(this).attr("data-to");
                if (from) { value["from"] = from }
                if (to) { value["to"] = to }
            } else if (facet.type === "geo_distance") {
                var from = $(this).attr("data-from");
                var to = $(this).attr("data-to");
                if (from) { value["from"] = from }
                if (to) { value["to"] = to }
            } else if (facet.type == "date_histogram") {
                value = $(this).attr("data-from");
            }
            // FIXMe: statistical facet
            
            deSelectFilter(facet, field, value);
            publishSelectedFilters();
            
            // reset the result set to the beginning and search again
            options.from = 0;
            doSearch();
        }

        function publishSelectedFilters() {
            options.behaviour_set_selected_filters(options, obj);

            $('.facetview_filterselected', obj).unbind('click', clickClearFilter);
            $('.facetview_filterselected', obj).bind('click', clickClearFilter);
        }
        
        function facetVisibility() {
            $('.facetview_filters', obj).each(function() {
                var facet = selectFacet(options, $(this).attr('data-href'));
                var values = "values" in facet ? facet["values"] : [];
                var visible = !facet.disabled;
                if (!facet.disabled) {
                    if (facet.type === "terms") {
                        // terms facet becomes deactivated if the number of results is less than the deactivate threshold defined
                        visible = values.length > facet.deactivate_threshold;
                    } else if (facet.type === "range") {
                        // range facet becomes deactivated if there is a count of 0 in every value
                        var view = false;
                        for (var i = 0; i < values.length; i = i + 1) {
                            var val = values[i];
                            if (val.count > 0) {
                                view = true;
                                break
                            }
                        }
                        visible = view
                    } else if (facet.type === "geo_distance") {
                        // distance facet becomes deactivated if there is a count of 0 in every value
                        var view = false;
                        for (var i = 0; i < values.length; i = i + 1) {
                            var val = values[i];
                            if (val.count > 0) {
                                view = true;
                                break
                            }
                        }
                        visible = view
                    } else if (facet.type === "date_histogram") {
                        // date histogram facet becomes deactivated if there is a count of 0 in every value
                        var view = false;
                        for (var i = 0; i < values.length; i = i + 1) {
                            var val = values[i];
                            if (val.count > 0) {
                                view = true;
                                break
                            }
                        }
                        visible = view
                    }
                    // FIXME: statistical facet?
                }

                options.behaviour_facet_visibility(options, obj, facet, visible)
            });
        }

        // select the facet tooltip
        function clickTooltipMore(event) {
            event.preventDefault();
            var field = $(this).attr("data-field");
            var el = facetElement("#facetview_filter_", field, obj);
            el.find(".facetview_tooltip").hide();
            el.find(".facetview_tooltip_value").show();
        }

        // select the facet tooltip
        function clickTooltipLess(event) {
            event.preventDefault();
            var field = $(this).attr("data-field");
            var el = facetElement("#facetview_filter_", field, obj);
            el.find(".facetview_tooltip_value").hide();
            el.find(".facetview_tooltip").show();
        }
        
        /**************************************************************
         * result metadata/paging handling
         *************************************************************/
        
        // decrement result set
        function decrementPage(event) {
            event.preventDefault();
            if ($(this).hasClass("facetview_inactive_link")) {
                return
            }
            options.from = parseInt(options.from) - parseInt(options.page_size);
            options.from < 0 ? options.from = 0 : "";
            doSearch();
        };
        
        // increment result set
        function incrementPage(event) {
            event.preventDefault();
            if ($(this).hasClass("facetview_inactive_link")) {
                return
            }
            options.from = parseInt(options.from) + parseInt(options.page_size);
            doSearch();
        };
        
        /////// display results metadata /////////////////////////////////
        
        function setUIResultsMetadata() {
            if (!options.data.found) {
                $('.facetview_metadata', obj).html("");
                return
            }
            frag = options.render_results_metadata(options);
            $('.facetview_metadata', obj).html(frag);
            $('.facetview_decrement', obj).bind('click', decrementPage);
            $('.facetview_increment', obj).bind('click', incrementPage);
        }
        
        /**************************************************************
         * result set display
         *************************************************************/
        
        function setUINotFound() {
            frag = options.render_not_found();
            $('#facetview_results', obj).html(frag);
        }
        
        function setUISearchResults() {
            var frag = ""
            for (var i = 0; i < options.data.records.length; i++) {
                var record = options.data.records[i];
                frag += options.render_result_record(options, record)
            }
            $('#facetview_results', obj).html(frag);
            $('#facetview_results', obj).children().hide().fadeIn(options.fadein);
            // FIXME: is possibly a debug feature?
            // $('.facetview_viewrecord', obj).bind('click', viewrecord);
        }
        
        /**************************************************************
         * search handling
         *************************************************************/
        
        function querySuccess(rawdata, results) {
            if (options.debug) {
                addDebug(JSON.stringify(rawdata));
                addDebug(JSON.stringify(results))
            }
            
            // record the data coming from elasticsearch
            options.rawdata = rawdata;
            options.data = results;
            
            // if a post search callback is provided, run it
            if (typeof options.post_search_callback == 'function') {
                options.post_search_callback(options, obj);
            }
            
            // if a pre-render callback is provided, run it
            if (typeof options.pre_render_callback == 'function') {
                options.pre_render_callback(options, obj);
            }
            
            // for each facet, get the results and add them to the page
            for (var each = 0; each < options.facets.length; each++) {
                // get the facet, the field name and the size
                var facet = options.facets[each];

                // no need to populate any disabled facets
                if (facet.disabled) { continue }

                var field = facet['field'];
                var size = facet.hasOwnProperty("size") ? facet["size"] : options.default_facet_size;
                
                // get the records to be displayed, limited by the size and record against
                // the options object
                var records = results["facets"][field];
                // special rule for handling statistical, range and histogram facets
                if (records.hasOwnProperty("_type") && records["_type"] === "statistical") {
                    facet["values"] = records
                } else {
                    if (!records) { records = [] }
                    if (size) { // this means you can set the size of a facet to something false (like, false, or 0, and size will be ignored)
                        if (facet.type === "terms" && facet.ignore_empty_string) {
                            facet["values"] = [];
                            for (var i = 0; i < records.length; i++) {
                                if (facet.values.length > size) {
                                    break;
                                }
                                if (records[i].term !== "") {
                                    facet["values"].push(records[i]);
                                }
                            }
                        } else {
                            facet["values"] = records.slice(0, size)
                        }
                    } else {
                        facet["values"] = records
                    }
                }

                // set the results on the page
                if (!facet.hidden) {
                    setUIFacetResults(facet)
                }
            }
            
            // set the facet visibility
            facetVisibility();
            
            // add the results metadata (paging, etc)
            setUIResultsMetadata();
            
            // show the not found notification if necessary, otherwise render the results
            if (!options.data.found) {
                setUINotFound()
            } else {
                setUISearchResults()
            }
            
            // if a post-render callback is provided, run it
            if (typeof options.post_render_callback == 'function') {
                options.post_render_callback(options, obj);
            }
        }
        
        function queryComplete(jqXHR, textStatus) {
            options.behaviour_finished_searching(options, obj);
            options.searching = false;
        }

        function pruneActiveFilters() {
            for (var i = 0; i < options.facets.length; i++) {
                var facet = options.facets[i];
                if (facet.disabled) {
                    if (facet.field in options.active_filters) {
                        delete options.active_filters[facet.field];
                    }
                }
            }
            publishSelectedFilters();
        }
        
        function doSearch() {
            // FIXME: does this have any weird side effects?
            // if a search is currently going on, don't do anything
            if (options.searching) {
                // alert("already searching")
                return
            }
            options.searching = true; // we are executing a search right now

            // invalidate the existing short url
            options.current_short_url = false;
            
            // if a pre search callback is provided, run it
            if (typeof options.pre_search_callback === 'function') {
                options.pre_search_callback(options, obj);
            }
            
            // trigger any searching notification behaviour
            options.behaviour_show_searching(options, obj);

            // remove from the active filters any whose facets are disabled
            // (this may have happened during the pre-search callback, for example)
            pruneActiveFilters();

            // make the search query
            var queryobj = elasticSearchQuery({"options" : options});
            options.queryobj = queryobj
            if (options.debug) {
                var querystring = serialiseQueryObject(queryobj);
                addDebug(querystring)
            }
            
            // augment the URL bar if possible, and the share/save link
            urlFromOptions();
            
            // issue the query to elasticsearch
            doElasticSearchQuery({
                search_url: options.search_url,
                queryobj: queryobj,
                datatype: options.datatype,
                success: querySuccess,
                complete: queryComplete
            })
        }
        
        /**************************************************************
         * build all of the fragments that we want to render
         *************************************************************/
        
        // set the externally facing facetview options
        $.fn.facetview.options = deriveOptions();
        var options = $.fn.facetview.options;
        
        // render the facetview frame which will then be populated
        var thefacetview = options.render_the_facetview(options);
        var thesearchopts = options.render_search_options(options);
        var thefacets = options.render_facet_list(options);
        var searching = options.render_searching_notification(options);
        
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
                $(".facetview_search_options_container", obj).html(thesearchopts);
                
                // add the facets (empty at this stage), then set their visibility, which will fall back to the
                // worst case scenario for visibility - it means facets won't disappear after the search, only reappear
                if (thefacets != "") {
                    $('#facetview_filters', obj).html(thefacets);
                    facetVisibility();
                }
                
                // add the loading notification
                if (searching != "") {
                    $(".facetview_searching", obj).html(searching)
                }
                
                // populate all the page UI framework from the options
                uiFromOptions(options);
                
                // bind the search control triggers
                $(".facetview_startagain", obj).bind("click", clickStartAgain);
                $('.facetview_pagesize', obj).bind('click', clickPageSize);
                $('.facetview_order', obj).bind('click', clickOrder);
                $('.facetview_orderby', obj).bind('change', changeOrderBy);
                $('.facetview_searchfield', obj).bind('change', changeSearchField);
                $('.facetview_sharesave', obj).bind('click', clickShareSave);
                $('.facetview_freetext', obj).bindWithDelay('keyup', keyupSearchText, options.freetext_submit_delay);
                $('.facetview_force_search', obj).bind('click', clickSearch);
                $('.facetview_shorten_url', obj).bind('click', clickShortenUrl);
                $('.facetview_lengthen_url', obj).bind('click', clickLengthenUrl);
                
                // bind the facet control triggers
                $('.facetview_filtershow', obj).bind('click', clickFilterShow);
                $('.facetview_morefacetvals', obj).bind('click', clickMoreFacetVals);
                $('.facetview_sort', obj).bind('click', clickSort);
                $('.facetview_or', obj).bind('click', clickOr);
                
                // if a post initialisation callback is provided, run it
                if (typeof options.post_init_callback === 'function') {
                    options.post_init_callback(options, obj);
                }
                
                // if an initial search is requested, then issue it
                if (options.initialsearch) { doSearch() }
            };
            whenready();
        });
    }

    // facetview options are declared as a function so that they can be retrieved
    // externally (which allows for saving them remotely etc)
    $.fn.facetview.options = {};
    
})(jQuery);
