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
        for (var i = 0; i < hashes.length; i++) {
            var hash = hashes[i].split('=');
            if (hash.length > 1) {
                var newval = unescape(hash[1]);
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
     * id: facetview_searching - where the loading notification can go
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
    
    // insert loading notification
    thefacetview += '<div class="facetview_searching" style="display:none"></div>'
    
    // insert the table within which the results actually will go
    thefacetview += '<table class="table table-striped table-bordered" id="facetview_results"></table>'
    
    // make space at the bottom for the pager
    thefacetview += '<div class="facetview_metadata"></div>';
    
    // debug window near the bottom
    if (options.debug) {
        thefacetview += '<div class="facetview_debug" style="display:none"><textarea style="width: 95%; height: 300px"></textarea></div>'
    }
    
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
    var filterTmpl = '<table id="facetview_filter_{{FILTER_NAME}}" class="facetview_filters table table-bordered table-condensed table-striped" data-href="{{FILTER_EXACT}}"> \
        <tr><td><a class="facetview_filtershow" title="filter by {{FILTER_DISPLAY}}" \
        style="color:#333; font-weight:bold;" href="{{FILTER_EXACT}}"><i class="icon-plus"></i> {{FILTER_DISPLAY}} \
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

function renderFacetValues(options, facet) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_filtervalue - wrapper element for any value included in the list
     * class: facetview_filterselected - for any anchors around selected filters
     * class: facetview_clear - for any link which should remove a filter (must also provide data-field and data-value)
     * class: facetview_filterchoice - tags the anchor wrapped around the name of the (unselected) field
     */
    var selected_filters = options.active_filters[facet.field]
    var frag = ""
    
    // first render the active filters
    if (options.selected_filters_in_facet) {
        for (var i in selected_filters) {
            var value = selected_filters[i]
            var sf = '<tr class="facetview_filtervalue" style="display:none;"><td>'
            sf += "<strong>" + value + "</strong> "
            sf += '<a class="facetview_filterselected facetview_clear" data-field="' + facet.field + '" data-value="' + value + '" href="' + value + '"><i class="icon-black icon-remove" style="margin-top:1px;"></i></a>'
            sf += "</td></tr>"
            frag += sf
        }
    }
    
    // then render the remaining selectable facets
    for (var i in facet["values"]) {
        var f = facet["values"][i]
        if ($.inArray(f.term.toString(), selected_filters) === -1) { // the toString helps us with non-string filters (e.g integers)
            var append = options.render_facet_result(options, facet, f, selected_filters)
            frag += append
        }
    }
    
    return frag
}

function renderFacetResult(options, facet, result, selected_filters) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_filtervalue - tags the top level element as being a facet result
     * class: facetview_filterchoice - tags the anchor wrapped around the name of the field
     */
    var append = '<tr class="facetview_filtervalue" style="display:none;"><td><a class="facetview_filterchoice' +
                '" data-field="' + facet['field'] + '" data-value="' + result.term + '" href="' + result.term + 
                '"><span class="facetview_filterchoice_text">' + result.term + '</span>' +
                '<span class="facetview_filterchoice_count"> (' + result.count + ')</span></a></td></tr>';
    return append
}

function renderFacetVisibility(facet, element, visible) {
    // FIXME: this should be a behaviour plugin
    element.find('.facetview_filtershow').css({'color':'#333','font-weight':'bold'}).children('i').show();
    if (visible) {
        element.show();
    } else {
        var hide = "hide_inactive" in facet ? facet["hide_inactive"] : false
        if (hide) {
            element.hide();
        }
        element.find('.facetview_filtershow').css({'color':'#ccc','font-weight':'normal'}).children('i').hide();
    };
}

function searchingNotification(options) {
    return "SEARCHING..."
}

function basicPager(options) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_decrement - anchor to move the page back
     * class: facetview_increment - anchor to move the page forward
     * class: facetview_inactive_link - for links which should not have any effect (helpful for styling bootstrap lists without adding click features)
     */
     
    // ensure our starting points are integers, then we can do maths on them
    var from = parseInt(options.from)
    var size = parseInt(options.page_size)
    
    // calculate the human readable values we want
    var to = from + size
    from = from + 1 // zero indexed
    if (options.data.found < to) { to = options.data.found }
    var total = options.data.found
    
    // forward and back-links, taking into account start and end boundaries
    var backlink = '<a class="facetview_decrement">&laquo; back</a>'
    if (from < size) { backlink = "<a class='facetview_decrement facetview_inactive_link'>..</a>" }
    
    var nextlink = '<a class="facetview_increment">next &raquo;</a>'
    if (options.data.found <= to) { nextlink = "<a class='facetview_increment facetview_inactive_link'>..</a>" }
    
    var meta = '<div class="pagination"><ul>'
    meta += '<li class="prev">' + backlink + '</li>'
    meta += '<li class="active"><a>' + from + ' &ndash; ' + to + ' of ' + total + '</a></li>'
    meta += '<li class="next">' + nextlink + '</li>'
    meta += "</ul></div>"
    
    return meta
}

function pageSlider(options) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_decrement - anchor to move the page back
     * class: facetview_increment - anchor to move the page forward
     * class: facetview_inactive_link - for links which should not have any effect (helpful for styling bootstrap lists without adding click features)
     */
     
    // ensure our starting points are integers, then we can do maths on them
    var from = parseInt(options.from)
    var size = parseInt(options.page_size)
    
    // calculate the human readable values we want
    var to = from + size
    from = from + 1 // zero indexed
    if (options.data.found < to) { to = options.data.found }
    var total = options.data.found
    
    // forward and back-links, taking into account start and end boundaries
    var backlink = '<a alt="previous" title="previous" class="facetview_decrement" style="color:#333;float:left;padding:0 40px 20px 20px;">&lt;</a>'
    if (from < size) { 
        backlink = '<a class="facetview_decrement facetview_inactive_link" style="color:#333;float:left;padding:0 40px 20px 20px;">..</a>'
    }
    
    var nextlink = '<a alt="next" title="next" class="facetview_increment" style="color:#333;float:right;padding:0 20px 20px 40px;">&gt;</a>'
    if (options.data.found <= to) { 
        nextlink = '<a class="facetview_increment facetview_inactive_link" style="color:#333;float:right;padding:0 20px 20px 40px;">..</a>'
    }
    
    var meta = '<div style="font-size:20px;font-weight:bold;margin:5px 0 10px 0;padding:5px 0 5px 0;border:1px solid #eee;border-radius:5px;-moz-border-radius:5px;-webkit-border-radius:5px;">'
    meta += backlink
    meta += '<span style="margin:30%;">' + from + ' &ndash; ' + to + ' of ' + total + '</span>'
    meta += nextlink
    meta += '</div>'
    
    return meta
}

function renderNotFound() {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_not_found - the id of the top level element containing the not found message
     */
    return "<tr class='facetview_not_found'><td>No results found</td></tr>"
}

function renderResultRecord(options, record) {
    // get our custom configuration out of the options
    var result = options.resultwrap_start;
    var display = options.result_display;
    
    // build up a full string representing the object
    var lines = '';
    for (var lineitem = 0; lineitem < display.length; lineitem++) {
        line = "";
        for (var object = 0; object < display[lineitem].length; object++) {
            var thekey = display[lineitem][object]['field'];
            var thevalue = ""
            if (typeof options.results_render_callbacks[thekey] == 'function') {
                // a callback is defined for this field so just call it
                thevalue = options.results_render_callbacks[thekey].call(this, record);
            } else {
                // split the key up into its parts, and work our way through the
                // tree until we get to the node to display.  Note that this will only
                // work with a string hierarchy of dicts - it can't have lists in it
                parts = thekey.split('.');
                var res = record
                for (var i = 0; i < parts.length; i++) {
                    res = res[parts[i]]
                }
                
                // just get a string representation of the object
                if (res) {
                    thevalue = res.toString()
                }
            }
            
            // if we have a value to display, sort out the pre-and post- stuff and build the new line
            if (thevalue && thevalue.toString().length) {
                if (display[lineitem][object]['pre']) {
                    line += display[lineitem][object]['pre']
                }
                line += thevalue;

                if (display[lineitem][object]['post']) {
                    line += display[lineitem][object]['post'];
                } else if(!display[lineitem][object]['notrailingspace']) {
                    line += ' ';
                }
            }
        }
        
        // if we have a line, append it to the full lines and add a line break
        if (line) {
            lines += line.replace(/^\s/,'').replace(/\s$/,'').replace(/\,$/,'') + "<br />";
        }
    }
    
    // if we have the lines, append them to the result wrap start
    if (lines) {
        result += lines
    }
    
    // close off the result with the ending strings, and then return
    result += options.resultwrap_end;
    return result;
}

function renderActiveFilter(options, facet, field, filter_list) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_filterselected - anchor tag for any clickable filter selection
     * class: facetview_clear - anchor tag for any link which will remove the filter (should also provide data-value and data-field)
     * class: facetview_inactive_link - any link combined with facetview_filterselected which should not execute when clicked
     */
    var clean = safeId(field)
    var display = facet.display ? facet.display : facet.field
    var logic = facet.logic ? facet.logic : options.default_facet_operator
    
    var frag = "<div id='facetview_filter_group_'" + clean + "' class='btn-group'>"
    
    if (options.show_filter_field) {
        frag += '<a class="btn btn-info facetview_inactive_link facetview_filterselected" href="' + field + '">'
        frag += '<span class="facetview_filterselected_text"><strong>' + display + '</strong></span>'
        frag += "</a>"
    }
        
    for (var i = 0; i < filter_list.length; i++) {
        var value = filter_list[i]
        frag += '<a class="facetview_filterselected facetview_clear btn btn-info" data-field="' + field + '" data-value="' + value + '" alt="remove" title="remove" href="' + value + '">'
        frag += '<span class="facetview_filterselected_text">' + value + '</span> <i class="icon-white icon-remove" style="margin-top:1px;"></i>'
        frag += "</a>"
        
        if (i !== filter_list.length - 1 && options.show_filter_logic) {
            frag += '<a class="btn btn-info facetview_inactive_link facetview_filterselected" href="' + field + '">'
            frag += '<span class="facetview_filterselected_text"><strong>' + logic + '</strong></span>'
            frag += "</a>"
        }
    }
    frag += "</div>"
    
    return frag        
}

/******************************************************************
 * DEFAULT CALLBACKS AND PLUGINS
 *****************************************************************/
 
// the lifecycle callbacks
function postInit(options, context) {}
function preSearch(options, context) {}
function postSearch(options, context) {}
function preRender(options, context) {}
function postRender(options, context) {}

// behaviour functions
function showSearchingNotification(options, context) {
    $(".facetview_searching", context).show()
}

function hideSearchingNotification(options, context) {
    $(".facetview_searching", context).hide()
}

function setFacetOpenness(options, context, facet) {
    var el = context.find("#facetview_filter_" + safeId(facet.field))
    var open = facet["open"]
    if (open) {
        el.find(".facetview_filtershow").find("i").removeClass("icon-plus")
        el.find(".facetview_filtershow").find("i").addClass("icon-minus")
        el.find(".facetview_filteroptions").show()
        el.find(".facetview_filtervalue").show()
    } else {
        el.find(".facetview_filtershow").find("i").removeClass("icon-minus")
        el.find(".facetview_filtershow").find("i").addClass("icon-plus")
        el.find(".facetview_filteroptions").hide()
        el.find(".facetview_filtervalue").hide()
    }
}

/******************************************************************
 * URL MANAGEMENT
 *****************************************************************/

function shareableUrl(options, query_part_only, include_fragment) {
    var source = elasticSearchQuery({"options" : options, "include_facets" : options.include_facets_in_url, "include_fields" : options.include_fields_in_url})
    var querypart = "?source=" + serialiseQueryObject(source) // FIXME: this may be where we need to deal with unicode characters
    include_fragment = include_fragment === undefined ? true : include_fragment
    if (include_fragment) {
        var fragment_identifier = options.url_fragment_identifier ? options.url_fragment_identifier : ""
        querypart += fragment_identifier
    }
    if (query_part_only) {
        return querypart
    }
    return 'http://' + window.location.host + window.location.pathname + querypart
}

/******************************************************************
 * ELASTICSEARCH INTEGRATION
 *****************************************************************/

function optionsFromQuery(query) {
    var opts = {}
    
    // from position
    if (query.from) { opts["from"] = query.from }
    
    // page size
    if (query.size) { opts["page_size"] = query.size }
    
    if (query["sort"]) { opts["sort"] = query["sort"] }
    
    // get hold of the bool query if it is there
    // and get hold of the query string and default operator if they have been provided
    if (query.query) {
        var sq = query.query
        var must = []
        var qs = undefined
        
        // if this is a filtered query, pull must and qs out of the filter
        // otherwise the root of the query is the query_string object
        if (sq.filtered) {
            must = sq.filtered.filter.bool.must
            qs = sq.filtered.query
        } else {
            qs = sq
        }
        
        // go through each clause in the must and pull out the options
        if (must.length > 0) {
            opts["active_filters"] = {}
            opts["_selected_operators"] = {}
        }
        for (var i = 0; i < must.length; i++) {
            var clause = must[i]
            
            // could be a term query (implies AND on this field)
            if ("term" in clause) {
                for (var field in clause.term) {
                    opts["_selected_operators"][field] = "AND"
                    var value = clause.term[field]
                    if (!(field in opts["active_filters"])) {
                        opts["active_filters"][field] = []
                    }
                    opts["active_filters"][field].push(value)
                }
            }
            
            // could be a terms query (implies OR on this field)
            if ("terms" in clause) {
                for (var field in clause.terms) {
                    opts["_selected_operators"][field] = "OR"
                    var values = clause.terms[field]
                    opts["active_filters"][field] = values
                }
            }
        }
        
        if (qs) {
            if (qs.query_string) {
                var string = qs.query_string.query
                var field = qs.query_string.default_field
                var op = qs.query_string.default_operator
                if (string) { opts["q"] = string }
                if (field) { opts["searchfield"] = field }
                if (op) { opts["default_operator"] = op }
            }
        }
        
        return opts
    }
}

function elasticSearchQuery(params) {
    // break open the parameters
    var options = params.options
    var include_facets = "include_facets" in params ? params.include_facets : true
    var include_fields = "include_fields" in params ? params.include_fields : true
    
    // FIXME: duplicated from inside the facetview jquery plugin bit below - perhaps rationalise this somehow?
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
    
    // read any filters out of the options and create an array of "must" queries which 
    // will constrain the search results
    var filter_must = []
    for (var field in options.active_filters) {
        var facet = selectFacet(field)
        var filter_list = options.active_filters[field]
        var logic = options.default_facet_operator
        if ("logic" in facet) { logic = facet["logic"] }
        if (logic === "AND") {
            for (var i in filter_list) {
                var value = filter_list[i]
                var tq = {"term" : {}}
                tq["term"][field] = value
                filter_must.push(tq)
            }
        } else if (logic === "OR") {
            var tq = {"terms" : {}}
            tq["terms"][field] = filter_list
            filter_must.push(tq)
        }
    }
    
    // read any pre-defined filters
    // FIXME: do this when we have understood filter selection mechanics (above)
    
    // search string and search field produce a query_string query element
    var querystring = options.q
    var searchfield = options.searchfield
    var default_operator = options.default_operator
    var ftq = undefined
    if (querystring) {
        ftq = {'query_string' : { 'query': fuzzify(querystring, options.default_freetext_fuzzify) }};
        if (searchfield) {
            ftq.query_string["default_field"] = searchfield
        }
        if (default_operator) {
            ftq.query_string["default_operator"] = default_operator
        }
    } else {
        ftq = {"match_all" : {}}
    }
    
    // if there are filter constraints (filter_must) then we create a filtered query,
    // otherwise make a normal query
    var qs = undefined
    if (filter_must.length > 0) {
        qs = {"query" : {"filtered" : {"filter" : {"bool" : {"must" : filter_must}}}}}
        qs.query.filtered["query"] = ftq;
    } else {
        qs = {"query" : ftq}
    }
    
    // sort order and direction
    options.sort.length > 0 ? qs['sort'] = options.sort : "";
    
    // fields and partial fields
    if (include_fields) {
        options.fields ? qs['fields'] = options.fields : "";
        options.partial_fields ? qs['partial_fields'] = options.partial_fields : "";
    }
    
    // paging (number of results, and start cursor)
    if (options.from) {
        qs["from"] = options.from
    }
    if (options.page_size) {
        qs["size"] = options.page_size
    }
    
    // facets
    if (include_facets) {
        qs['facets'] = {};
        for (var item = 0; item < options.facets.length; item++) {
            var defn = options.facets[item]
            var type = "terms"
            if ("type" in defn) {
                type = defn["type"]
            }
            var size = options.default_facet_size
            if ("size" in defn) {
                size = defn["size"]
            }
            size += options.elasticsearch_facet_inflation // add a bunch of extra values to the facets to deal with the shard count issue
            
            var facet = {}
            if (type === "terms") {
                facet["terms"] = {"field" : defn["field"], "size" : size}
                qs["facets"][defn["field"]] = facet
            }
        }
        
        // and any extra facets
        // FIXME: this does not include any treatment of the facet size inflation that may be required
        jQuery.extend(true, qs['facets'], options.extra_facets );
    }
    
    return qs
}
    
    // FIXME: effectively this stuff can go, but we need to replicate range faceting and
    // predefined filters and these are here as a reminder
    /*
    var bool = options.bool ? options.bool : false
    var nested = false;
    var seenor = []; // track when an or group are found and processed
    $('.facetview_filterselected',obj).each(function() {
        // FIXME: this will overwrite any existing bool in the options
        !bool ? bool = {'must': [] } : "";
        if ( $(this).hasClass('facetview_facetrange') ) {
            var rngs = {
                'from': $('.facetview_lowrangeval_' + $(this).attr('rel'), this).html(),
                'to': $('.facetview_highrangeval_' + $(this).attr('rel'), this).html()
            };
            var rel = options.facets[ $(this).attr('rel') ]['field'];
            var robj = {'range': {}};
            robj['range'][ rel ] = rngs;
            // check if this should be a nested query
            var parts = rel.split('.');
            if ( options.nested.indexOf(parts[0]) != -1 ) {
                !nested ? nested = {"nested":{"_scope":parts[0],"path":parts[0],"query":{"bool":{"must":[robj]}}}} : nested.nested.query.bool.must.push(robj);
            } else {
                bool['must'].push(robj);
            }
        }
    });
    for (var item in options.predefined_filters) {
        // FIXME: this may overwrite existing bool option
        !bool ? bool = {'must': [] } : "";
        var pobj = options.predefined_filters[item];
        var parts = item.split('.');
        if ( options.nested.indexOf(parts[0]) != -1 ) {
            !nested ? nested = {"nested":{"_scope":parts[0],"path":parts[0],"query":{"bool":{"must":[pobj]}}}} : nested.nested.query.bool.must.push(pobj);
        } else {
            bool['must'].push(pobj);
        }
    }
    */


function fuzzify(querystr, default_freetext_fuzzify) {
    var rqs = querystr
    if (default_freetext_fuzzify !== undefined) {
        if (default_freetext_fuzzify == "*" || default_freetext_fuzzify == "~") {
            if (querystr.indexOf('*') == -1 && querystr.indexOf('~') == -1 && querystr.indexOf(':') == -1) {
                var optparts = querystr.split(' ');
                pq = "";
                for ( var oi = 0; oi < optparts.length; oi++ ) {
                    var oip = optparts[oi];
                    if ( oip.length > 0 ) {
                        oip = oip + default_freetext_fuzzify;
                        default_freetext_fuzzify == "*" ? oip = "*" + oip : false;
                        pq += oip + " ";
                    }
                };
                rqs = pq;
            };
        };
    };
    return rqs;
};

var elasticsearch_special_chars = ['(', ')', '{', '}', '[', ']', '^' , ':', '/'];

function jsonStringEscape(key, value) {
    if (key == "query" && typeof(value) == 'string') {
        for (var each = 0; each < elasticsearch_special_chars.length; each++) {
            value = value.replace(elasticsearch_special_chars[each],'\\' + elasticsearch_special_chars[each], 'g');
        }
        return value;
    }
    return value;
};

function serialiseQueryObject(qs) {
    return JSON.stringify(qs, jsonStringEscape);
};

// closure for elastic search success, which ultimately calls
// the user's callback
function elasticSearchSuccess(callback) {
    return function(data) {
        var resultobj = {
            "records" : [],
            "start" : "",
            "found" : data.hits.total,
            "facets" : {}
        }
        
        // load the results into the records part of the result object
        for (var item = 0; item < data.hits.hits.length; item++) {
            var res = data.hits.hits[item]
            if ("fields" in res) {
                // partial fields are also included here - no special treatment
                resultobj.records.push(res.fields)
            } else {
                resultobj.records.push(res._source)
            }
        }
        
        for (var item in data.facets) {
            var facet = data.facets[item]
            // handle any terms facets
            if ("terms" in facet) {
                // FIXME: this is the point where we undo the stuff to do with the
                // size of the facets
                var terms = facet["terms"]
                resultobj["facets"][item] = terms
            }
        }
            
        callback(data, resultobj)
    }
}

function doElasticSearchQuery(params) {
    // extract the parameters of the request
    var success_callback = params.success
    var complete_callback = params.complete
    var search_url = params.search_url
    var queryobj = params.queryobj
    var datatype = params.datatype
    
    // serialise the query
    var querystring = serialiseQueryObject(queryobj)
    
    // make the call to the elasticsearch web service
    $.ajax({
        type: "get",
        url: search_url,
        data: {source: querystring},
        dataType: datatype,
        success: elasticSearchSuccess(success_callback),
        complete: complete_callback
    });
}

/******************************************************************
 * FACETVIEW ITSELF
 *****************************************************************/

(function($){
    $.fn.facetview = function(options) {
    
        /**************************************************************
         * handle the incoming options, default options and url parameters
         *************************************************************/
         
        // specify all the default options
        var defaults = {
            // elasticsearch parameters
            "search_url" : "http://localhost:9200/_search",
            "datatype" : "jsonp",
            "default_freetext_fuzzify": false,
            "fields" : false,
            "partial_fields" : false,
            "elasticsearch_facet_inflation" : 100,
            
            // view parameters
            "facets" : [], // {"field" : "<es field>", "display" : "<Display Name>", "logic" : "AND|OR", "open" : true|false, "deactivate_threshold" : <num>, "hide_inactive" : true|false}
            "extra_facets": {},
            "page_size" : 10,
            "from" : 0,
            "search_sortby" : [],
            "searchbox_fieldselect" : [],
            "sharesave_link" : true,
            "sort" : [],
            "searchfield" : "",
            "q" : "",
            "include_facets_in_url" : false,
            "include_fields_in_url" : false,
            "selected_filters_in_facet" : true, // puts the filter at the top of the facet when open
            "show_filter_field" : true, // puts the filter field in the filter selected bar
            "show_filter_logic" : true, // puts AND/OR in the filter selected bar
            
            // FIXME: we should probably initialise each of these in the relevant objects at page load,
            // so we don't have to keep looking them up
            // default settings
            "default_facet_size" : 10,
            "default_facet_operator" : "AND",
            "default_facet_order" : "count",
            "default_facet_open" : false,
            "default_facet_hide_inactive" : false,
            "default_facet_deactivate_threshold" : 0, // equal to or less than this number will deactivate the facet
            "default_operator" : "OR",
            
            // FIXME: not sure what to do about these yet
            "predefined_filters" : [],
            
            // behaviours
            "freetext_submit_delay" : 500,
            "initialsearch" : true,
            "debug" : false,
            "fadein" : 800,
            "pushstate" : true,
            
            // render parameters
            "render_the_facetview" : theFacetview,
            "render_search_options" : searchOptions,
            "render_facet_list" : facetList,
            "render_term_facet" : renderTermFacet,
            "render_searching_notification" : searchingNotification,
            "render_facet_values" : renderFacetValues, // the list of facets
            "render_facet_result" : renderFacetResult, // individual facets
            "render_facet_visibility" : renderFacetVisibility,
            "render_results_metadata" : basicPager, // or use pageSlider
            "render_not_found" : renderNotFound,
            "render_result_record" : renderResultRecord,
            "render_active_filter" : renderActiveFilter,
            
            // configuration options for standard render plugins
            "resultwrap_start":"<tr><td>",
            "resultwrap_end":"</td></tr>",
            "result_display" : [ [ {"pre" : "<strong>ID</strong>:", "field": "id", "post" : "<br><br>"} ] ],
            "results_render_callbacks" : {},
            
            // behaviour plugins
            "behaviour_show_searching" : showSearchingNotification,
            "behaviour_finished_searching" : hideSearchingNotification,
            "behaviour_toggle_facet_open" : setFacetOpenness,
            
            // callbacks
            "post_init_callback" : postInit,
            "pre_search_callback" : preSearch,
            "post_search_callback" : postSearch,
            "pre_render_callback" : preRender,
            "post_render_callback" : postRender,
            
            // internal admin stuff (don't touch)
            "searching" : false,
            "queryobj" : false,
            "rawdata" : false,
            "data" : false,
            "active_filters" : {}
        }
        
        function deriveOptions() {
            // extend the defaults with the provided options
            var provided_options = $.extend(defaults, options);
            
            // deal with the options that come from the url, which require some special treatment
            var url_params = $.getUrlVars();
            var url_options = {}
            if ("source" in url_params) {
                url_options = optionsFromQuery(url_params["source"])
            }
            if ("url_fragment_identifier" in url_params) {
                url_options["url_fragment_identifier"] = url_params["url_fragment_identifier"]
            }
            provided_options = $.extend(provided_options, url_options);
            
            // copy the _selected_operators data into the relevant facets
            // for each pre-selected operator, find the related facet and set its "logic" property
            var so = provided_options._selected_operators ? provided_options._selected_operators : {}
            for (var field in so) {
                var operator = so[field]
                for (var i in provided_options.facets) {
                    var facet = provided_options.facets[i]
                    if (facet.field === field) {
                        facet["logic"] = operator
                    }
                }
            }
            if ("_selected_operators" in provided_options) {
                delete provided_options._selected_operators
            }
            
            return provided_options
        }
        
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
            
            // for any existing filters, render them
            setUISelectedFilters()
        }
        
        function urlFromOptions() {
            
            if (options.pushstate && 'pushState' in window.history) {
                var querypart = shareableUrl(options, true, true)
                
                // FIXME: deal with this when we do url treatment properly
                //if (url_options['facetview_url_anchor']) {
                //    currurl += url_options['facetview_url_anchor'];
                //}
                
                window.history.pushState("", "search", querypart);
            }
            
            // also do the share save url
            var shareable = shareableUrl(options)
            if (options.sharesave_link) { $('.facetview_sharesaveurl', obj).val(shareable); }
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
                setUIPageSize(options.page_size);
                doSearch();
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
            doSearch();
        }
        
        function changeOrderBy(event) {
            event.preventDefault()
            
            // synchronise the new sort with the options
            saveSortOption();
            
            // reset the cursor and issue a search
            options.from = 0;
            doSearch();
        }
        
        // set the UI to present the given ordering
        function setUIOrder(params) {
            // FIXME: should be a behaviour plugin
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
            doSearch();
        };
        
        // keyup in search box
        function keyupSearchText(event) {
            event.preventDefault()
            var q = $(this).val()
            options.q = q
            doSearch()
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
            
            var name = $(this).attr("href")
            var facet = selectFacet(name)
            var el = facetElement("#facetview_filter_", name)
            
            var open = "open" in facet ? facet["open"] : options.default_facet_open
            facet["open"] = !open
            setUIFacetOpen(facet)
        };
        
        function setUIFacetOpen(facet) {
            // FIXME: let's pre-set all of the values in facets at init time, so we don't have to keep doing this
            if (!("open" in facet)) { facet["open"] = options.default_facet_open } 
            options.behaviour_toggle_facet_open(options, obj, facet)
        }
        
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
                doSearch();
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
            doSearch();
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
            setUISelectedFilters()
            doSearch();
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
        
        /////// facet values /////////////////////////////////
        
        function setUIFacetResults(facet) {
            var el = facetElement("#facetview_filter_", facet["field"])
            el.children().find('.facetview_filtervalue').remove();
            
            if (!("values" in facet)) {
                return
            }
            
            var frag = options.render_facet_values(options, facet)
            el.append(frag)
            
            setUIFacetOpen(facet)
            
            // FIXME: probably all bindings should come with an unbind first
            // enable filter selection
            $('.facetview_filterchoice', obj).unbind('click', clickFilterChoice);
            $('.facetview_filterchoice', obj).bind('click', clickFilterChoice);
            
            // enable filter removal
            $('.facetview_filterselected', obj).unbind('click', clickClearFilter);
            $('.facetview_filterselected', obj).bind('click', clickClearFilter);
        }
        
        /////// selected filters /////////////////////////////////
        
        function clickFilterChoice(event) {
            event.preventDefault()
            var field = $(this).attr("data-field");
            var value = $(this).attr("data-value");
            
            // update the options and the filter display.  No need to update
            // the facet, as we'll issue a search straight away and it will
            // get updated automatically
            selectFilter(field, value);
            setUISelectedFilters()
            
            // reset the result set to the beginning and search again
            options.from = 0;
            doSearch();
        }
        
        function selectFilter(field, value) {
            if (!(field in options.active_filters)) {
                options.active_filters[field] = []
            }
            var filter = options.active_filters[field]
            if ($.inArray(value, filter) === -1 ) {
                filter.push(value)
            }
        }
        
        function deSelectFilter(field, value) {
            if (field in options.active_filters) {
                var filter = options.active_filters[field]
                var index = $.inArray(value, filter)
                filter.splice(index, 1)
                if (filter.length === 0) {
                    delete options.active_filters[field]
                }
            }
        }
        
        function setUISelectedFilters() {
            var frag = ""
            for (var field in options.active_filters) {
                var filter_list = options.active_filters[field]
                var facet = selectFacet(field)
                frag += options.render_active_filter(options, facet, field, filter_list)
            }
            
            $('#facetview_selectedfilters', obj).html(frag);
            $('.facetview_filterselected', obj).unbind('click', clickClearFilter);
            $('.facetview_filterselected', obj).bind('click', clickClearFilter);
        }
        
        function clickClearFilter(event) {
            event.preventDefault()
            if ($(this).hasClass("facetview_inactive_link")) {
                return
            }
            
            var field = $(this).attr("data-field");
            var value = $(this).attr("data-value");
            
            deSelectFilter(field, value)
            setUISelectedFilters()
            
            // reset the result set to the beginning and search again
            options.from = 0;
            doSearch();
        }
        
        function facetVisibility() {
            $('.facetview_filters', obj).each(function() {
                var facet = selectFacet($(this).attr('data-href'));
                var threshold = "deactivate_threshold" in facet ? facet["deactivate_threshold"] : options.default_facet_deactivate_threshold
                var values = "values" in facet ? facet["values"] : []
                var visible = threshold <= values.length
                options.render_facet_visibility(facet, $(this), visible)
            });
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
            frag = options.render_results_metadata(options)
            $('.facetview_metadata', obj).html(frag);
            $('.facetview_decrement', obj).bind('click', decrementPage);
            $('.facetview_increment', obj).bind('click', incrementPage);
        }
        
        /**************************************************************
         * result set display
         *************************************************************/
        
        function setUINotFound() {
            frag = options.render_not_found()
            $('#facetview_results', obj).html(frag);
        }
        
        function setUISearchResults() {
            var frag = ""
            for (var i = 0; i < options.data.records.length; i++) {
                var record = options.data.records[i]
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
                addDebug(JSON.stringify(rawdata))
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
                var facet = options.facets[each]
                var field = facet['field'];
                var size = facet["size"] ? facet["size"] : options.default_facet_size
                
                // get the records to be displayed, limited by the size and record against
                // the options object
                var records = results["facets"][field];
                if (!records) { records = [] }
                facet["values"] = records.slice(0, size)
                
                // set the results on the page
                setUIFacetResults(facet)
            }
            
            // set the facet visibility
            facetVisibility()
            
            // add the results metadata (paging, etc)
            setUIResultsMetadata()
            
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
            options.behaviour_finished_searching(options, obj)
            options.searching = false;
        }
        
        function doSearch() {
            // FIXME: does this have any weird side effects?
            // if a search is currently going on, don't do anything
            if (options.searching) {
                // alert("already searching")
                return
            }
            options.searching = true; // we are executing a search right now
            
            // if a pre search callback is provided, run it
            if (typeof options.pre_search_callback === 'function') {
                options.pre_search_callback(options, obj);
            }
            
            // trigger any searching notification behaviour
            options.behaviour_show_searching(options, obj)
            
            // make the search query
            var queryobj = elasticSearchQuery({"options" : options});
            options.queryobj = queryobj
            if (options.debug) {
                var querystring = serialiseQueryObject(queryobj)
                addDebug(querystring)
            }
            
            // augment the URL bar if possible, and the share/save link
            urlFromOptions()
            
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
        $.fn.facetview.options = deriveOptions()
        var options = $.fn.facetview.options;
        
        // render the facetview frame which will then be populated
        thefacetview = options.render_the_facetview(options)
        thesearchopts = options.render_search_options(options)
        thefacets = options.render_facet_list(options)
        searching = options.render_searching_notification(options)
        
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
                
                // add the loading notification
                if (searching != "") {
                    $(".facetview_searching", obj).html(searching)
                }
                
                // populate all the page UI framework from the options
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
