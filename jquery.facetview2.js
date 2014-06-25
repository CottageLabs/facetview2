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
    return s.replace(/\./gi,'_').replace(/\:/gi,'_')
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
    var test = ["a", "b", "c", ]  // note trailing comma, will produce ["a", "b", "c", undefined] in IE8 and ["a", "b", "c"] in every sane browser
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
     *
     * Should respect the following configs
     *
     * options.debug - is this a debug enabled facetview.  If so, put a debug textarea somewhere
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
     *
     * should (not must) respect the following configs
     *
     * options.search_sortby - list of sort fields and directions
     * options.searchbox_fieldselect - list of fields search can be focussed on
     * options.sharesave_link - whether to provide a copy of a link which can be saved
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
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * none - no requirements for specific classes and ids
     *
     * should (not must) respect the following config
     * 
     * options.render_terms_facet - renders a term facet into the list
     * options.render_range_facet - renders a range facet into the list
     * options.render_geo_facet - renders a geo distance facet into the list
     */
    if (options.facets.length > 0) {
        var filters = options.facets;
        var thefilters = '';
        for (var idx = 0; idx < filters.length; idx++) {
            var facet = filters[idx]
            var type = facet.type ? facet.type : "terms"
            if (type === "terms") {
                thefilters += options.render_terms_facet(facet, options)
            } else if (type === "range") {
                thefilters += options.render_range_facet(facet, options)
            } else if (type === "geo_distance") {
                thefilters += options.render_geo_facet(facet, options)
            }
        };
        return thefilters
    };
    return ""
};

function renderTermsFacet(facet, options) {
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

function renderRangeFacet(facet, options) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * id: facetview_filter_<safe filtername> - table for the specific filter
     *
     * each anchor must also have href="<filtername>"
     */
     
    // full template for the facet - we'll then go on and do some find and replace
    var filterTmpl = '<table id="facetview_filter_{{FILTER_NAME}}" class="facetview_filters table table-bordered table-condensed table-striped" data-href="{{FILTER_EXACT}}"> \
        <tr><td><a class="facetview_filtershow" title="filter by {{FILTER_DISPLAY}}" \
        style="color:#333; font-weight:bold;" href="{{FILTER_EXACT}}"><i class="icon-plus"></i> {{FILTER_DISPLAY}} \
        </a> \
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

function renderGeoFacet(facet, options) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * id: facetview_filter_<safe filtername> - table for the specific filter
     *
     * each anchor must also have href="<filtername>"
     */
     // full template for the facet - we'll then go on and do some find and replace
    var filterTmpl = '<table id="facetview_filter_{{FILTER_NAME}}" class="facetview_filters table table-bordered table-condensed table-striped" data-href="{{FILTER_EXACT}}"> \
        <tr><td><a class="facetview_filtershow" title="filter by {{FILTER_DISPLAY}}" \
        style="color:#333; font-weight:bold;" href="{{FILTER_EXACT}}"><i class="icon-plus"></i> {{FILTER_DISPLAY}} \
        </a> \
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

function renderTermsFacetValues(options, facet) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_filtervalue - wrapper element for any value included in the list
     * class: facetview_filterselected - for any anchors around selected filters
     * class: facetview_clear - for any link which should remove a filter (must also provide data-field and data-value)
     * class: facetview_filterchoice - tags the anchor wrapped around the name of the (unselected) field
     *
     * should (not must) respect the following config
     *
     * options.selected_filters_in_facet - whether to show selected filters in the facet pull-down (if that's your idiom)
     * options.render_facet_result - function which renders the individual facets
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
    
    // is there a pre-defined filter on this facet?
    var predefined = facet.field in options.predefined_filters ? options.predefined_filters[facet.field] : []
    
    // then render the remaining selectable facets
    for (var i in facet["values"]) {
        var f = facet["values"][i]
        if (options.exclude_predefined_filters_from_facets && $.inArray(f.term, predefined) > -1) { // note that the datatypes have to match
            continue
        }
        if ($.inArray(f.term.toString(), selected_filters) === -1) { // the toString helps us with non-string filters (e.g integers)
            var append = options.render_terms_facet_result(options, facet, f, selected_filters)
            frag += append
        }
    }
    
    return frag
}

function renderRangeFacetValues(options, facet) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_filtervalue - wrapper element for any value included in the list
     * class: facetview_filterselected - for any anchors around selected filters
     * class: facetview_clear - for any link which should remove a filter (must also provide data-field and data-value)
     * class: facetview_filterchoice - tags the anchor wrapped around the name of the (unselected) field
     *
     * should (not must) respect the following config
     *
     * options.selected_filters_in_facet - whether to show selected filters in the facet pull-down (if that's your idiom)
     * options.render_facet_result - function which renders the individual facets
     */
     
    function getValueForRange(range, values) {
        for (var i in values) {
            var value = values[i]
            
            // the "to"s match if they both value and range have a "to" and they are the same, or if neither have a "to"
            var match_to = (value.to && range.to && value.to === range.to) || (!value.to && !range.to)
            
            // the "from"s match if they both value and range have a "from" and they are the same, or if neither have a "from"
            var match_from = (value.from && range.from && value.from === range.from) || (!value.from && !range.from)
            
            if (match_to && match_from) {
                return value
            }
        }
    }
    
    function getRangeForValue(value, facet) {
        for (var i in facet.range) {
            var range = facet.range[i]
            
            // the "to"s match if they both value and range have a "to" and they are the same, or if neither have a "to"
            var match_to = (value.to && range.to && value.to === range.to.toString()) || (!value.to && !range.to)
            
            // the "from"s match if they both value and range have a "from" and they are the same, or if neither have a "from"
            var match_from = (value.from && range.from && value.from === range.from.toString()) || (!value.from && !range.from)
            
            if (match_to && match_from) {
                return range
            }
        }
    }
    
    var selected_range = options.active_filters[facet.field]
    var frag = ""
    
    // render the active filter if there is one
    if (options.selected_filters_in_facet && selected_range) {
        var range = getRangeForValue(selected_range, facet)
        already_selected = true
        
        var data_to = range.to ? " data-to='" + range.to + "' " : ""
        var data_from = range.from ? " data-from='" + range.from + "' " : ""
    
        var sf = '<tr class="facetview_filtervalue" style="display:none;"><td>'
        sf += "<strong>" + range.display + "</strong> "
        sf += '<a class="facetview_filterselected facetview_clear" data-field="' + facet.field + '" ' + data_to + data_from + ' href="#"><i class="icon-black icon-remove" style="margin-top:1px;"></i></a>'
        sf += "</td></tr>"
        frag += sf
        
        // if a range is already selected, we don't render any more
        return frag
    }
    
    // then render the remaining selectable facets if necessary
    for (var i in facet["range"]) {
        var r = facet["range"][i]
        var f = getValueForRange(r, facet["values"])
        if (f.count === 0 && facet.hide_empty_range) {
            continue
        }
        var append = options.render_range_facet_result(options, facet, f, r)
        frag += append
    }
    
    return frag
}

function renderGeoFacetValues(options, facet) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_filtervalue - wrapper element for any value included in the list
     * class: facetview_filterselected - for any anchors around selected filters
     * class: facetview_clear - for any link which should remove a filter (must also provide data-field and data-value)
     * class: facetview_filterchoice - tags the anchor wrapped around the name of the (unselected) field
     *
     * should (not must) respect the following config
     *
     * options.selected_filters_in_facet - whether to show selected filters in the facet pull-down (if that's your idiom)
     * options.render_facet_result - function which renders the individual facets
     */
     
    function getValueForRange(range, values) {
        for (var i in values) {
            var value = values[i]
            
            // the "to"s match if they both value and range have a "to" and they are the same, or if neither have a "to"
            var match_to = (value.to && range.to && value.to === range.to) || (!value.to && !range.to)
            
            // the "from"s match if they both value and range have a "from" and they are the same, or if neither have a "from"
            var match_from = (value.from && range.from && value.from === range.from) || (!value.from && !range.from)
            
            if (match_to && match_from) {
                return value
            }
        }
    }
    
    function getRangeForValue(value, facet) {
        for (var i in facet.distance) {
            var range = facet.distance[i]
            
            // the "to"s match if they both value and range have a "to" and they are the same, or if neither have a "to"
            var match_to = (value.to && range.to && value.to === range.to.toString()) || (!value.to && !range.to)
            
            // the "from"s match if they both value and range have a "from" and they are the same, or if neither have a "from"
            var match_from = (value.from && range.from && value.from === range.from.toString()) || (!value.from && !range.from)
            
            if (match_to && match_from) {
                return range
            }
        }
    }
    
    var selected_geo = options.active_filters[facet.field]
    var frag = ""
    
    // render the active filter if there is one
    if (options.selected_filters_in_facet && selected_geo) {
        var range = getRangeForValue(selected_geo, facet)
        already_selected = true
        
        var data_to = range.to ? " data-to='" + range.to + "' " : ""
        var data_from = range.from ? " data-from='" + range.from + "' " : ""
    
        var sf = '<tr class="facetview_filtervalue" style="display:none;"><td>'
        sf += "<strong>" + range.display + "</strong> "
        sf += '<a class="facetview_filterselected facetview_clear" data-field="' + facet.field + '" ' + data_to + data_from + ' href="#"><i class="icon-black icon-remove" style="margin-top:1px;"></i></a>'
        sf += "</td></tr>"
        frag += sf
        
        // if a range is already selected, we don't render any more
        return frag
    }
    
    // then render the remaining selectable facets if necessary
    for (var i in facet["distance"]) {
        var r = facet["distance"][i]
        var f = getValueForRange(r, facet["values"])
        if (f.count === 0 && facet.hide_empty_distance) {
            continue
        }
        var append = options.render_geo_facet_result(options, facet, f, r)
        frag += append
    }
    
    return frag
}

function renderTermsFacetResult(options, facet, result, selected_filters) {
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

function renderRangeFacetResult(options, facet, result, range) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_filtervalue - tags the top level element as being a facet result
     * class: facetview_filterchoice - tags the anchor wrapped around the name of the field
     */
    var data_to = range.to ? " data-to='" + range.to + "' " : ""
    var data_from = range.from ? " data-from='" + range.from + "' " : ""
    
    var append = '<tr class="facetview_filtervalue" style="display:none;"><td><a class="facetview_filterchoice' +
                '" data-field="' + facet['field'] + '" ' + data_to + data_from + ' href="#"><span class="facetview_filterchoice_text">' + range.display + '</span>' +
                '<span class="facetview_filterchoice_count"> (' + result.count + ')</span></a></td></tr>';
    return append
}

function renderGeoFacetResult(options, facet, result, range) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_filtervalue - tags the top level element as being a facet result
     * class: facetview_filterchoice - tags the anchor wrapped around the name of the field
     */
    var data_to = range.to ? " data-to='" + range.to + "' " : ""
    var data_from = range.from ? " data-from='" + range.from + "' " : ""
    
    var append = '<tr class="facetview_filtervalue" style="display:none;"><td><a class="facetview_filterchoice' +
                '" data-field="' + facet['field'] + '" ' + data_to + data_from + ' href="#"><span class="facetview_filterchoice_text">' + range.display + '</span>' +
                '<span class="facetview_filterchoice_count"> (' + result.count + ')</span></a></td></tr>';
    return append
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
     *
     * should (not must) respect the config
     *
     * options.from - record number results start from (may be a string)
     * options.page_size - number of results per page
     * options.data.found - the total number of records in the search result set
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
     *
     * should (not must) respect the config
     *
     * options.from - record number results start from (may be a string)
     * options.page_size - number of results per page
     * options.data.found - the total number of records in the search result set
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
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * none - no specific requirements
     *
     * should (not must) use the config
     *
     * options.resultwrap_start - starting elements for any result object
     * options.resultwrap_end - closing elements for any result object
     * options.result_display - line-by-line display commands for the result object
     */
     
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

function renderActiveTermsFilter(options, facet, field, filter_list) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_filterselected - anchor tag for any clickable filter selection
     * class: facetview_clear - anchor tag for any link which will remove the filter (should also provide data-value and data-field)
     * class: facetview_inactive_link - any link combined with facetview_filterselected which should not execute when clicked
     *
     * should (not must) respect the config
     *
     * options.show_filter_field - whether to include the name of the field the filter is active on
     * options.show_filter_logic - whether to include AND/OR along with filters
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

function renderActiveRangeFilter(options, facet, field, value) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_filterselected - anchor tag for any clickable filter selection
     * class: facetview_clear - anchor tag for any link which will remove the filter (should also provide data-value and data-field)
     * class: facetview_inactive_link - any link combined with facetview_filterselected which should not execute when clicked
     *
     * should (not must) respect the config
     *
     * options.show_filter_field - whether to include the name of the field the filter is active on
     */
    
    function getRangeForValue(value, facet) {
        for (var i in facet.range) {
            var range = facet.range[i]
            
            // the "to"s match if they both value and range have a "to" and they are the same, or if neither have a "to"
            var match_to = (value.to && range.to && value.to === range.to.toString()) || (!value.to && !range.to)
            
            // the "from"s match if they both value and range have a "from" and they are the same, or if neither have a "from"
            var match_from = (value.from && range.from && value.from === range.from.toString()) || (!value.from && !range.from)
            
            if (match_to && match_from) {
                return range
            }
        }
    }
    
    var clean = safeId(field)
    var display = facet.display ? facet.display : facet.field
    
    var frag = "<div id='facetview_filter_group_'" + clean + "' class='btn-group'>"
    
    if (options.show_filter_field) {
        frag += '<a class="btn btn-info facetview_inactive_link facetview_filterselected" href="' + field + '">'
        frag += '<span class="facetview_filterselected_text"><strong>' + display + '</strong></span>'
        frag += "</a>"
    }
    
    var range = getRangeForValue(value, facet)
    
    var data_to = value.to ? " data-to='" + value.to + "' " : ""
    var data_from = value.from ? " data-from='" + value.from + "' " : ""

    frag += '<a class="facetview_filterselected facetview_clear btn btn-info" data-field="' + field + '" ' + data_to + data_from + 
            ' alt="remove" title="remove" href="#">'
    frag += '<span class="facetview_filterselected_text">' + range.display + '</span> <i class="icon-white icon-remove" style="margin-top:1px;"></i>'
    frag += "</a>"
    
    frag += "</div>"
    
    return frag        
}

function renderActiveGeoFilter(options, facet, field, value) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_filterselected - anchor tag for any clickable filter selection
     * class: facetview_clear - anchor tag for any link which will remove the filter (should also provide data-value and data-field)
     * class: facetview_inactive_link - any link combined with facetview_filterselected which should not execute when clicked
     *
     * should (not must) respect the config
     *
     * options.show_filter_field - whether to include the name of the field the filter is active on
     */
    
    function getRangeForValue(value, facet) {
        for (var i in facet.distance) {
            var range = facet.distance[i]
            
            // the "to"s match if they both value and range have a "to" and they are the same, or if neither have a "to"
            var match_to = (value.to && range.to && value.to === range.to.toString()) || (!value.to && !range.to)
            
            // the "from"s match if they both value and range have a "from" and they are the same, or if neither have a "from"
            var match_from = (value.from && range.from && value.from === range.from.toString()) || (!value.from && !range.from)
            
            if (match_to && match_from) {
                return range
            }
        }
    }
    
    var clean = safeId(field)
    var display = facet.display ? facet.display : facet.field
    
    var frag = "<div id='facetview_filter_group_'" + clean + "' class='btn-group'>"
    
    if (options.show_filter_field) {
        frag += '<a class="btn btn-info facetview_inactive_link facetview_filterselected" href="' + field + '">'
        frag += '<span class="facetview_filterselected_text"><strong>' + display + '</strong></span>'
        frag += "</a>"
    }
    
    var range = getRangeForValue(value, facet)
    
    var data_to = value.to ? " data-to='" + value.to + "' " : ""
    var data_from = value.from ? " data-from='" + value.from + "' " : ""

    frag += '<a class="facetview_filterselected facetview_clear btn btn-info" data-field="' + field + '" ' + data_to + data_from + 
            ' alt="remove" title="remove" href="#">'
    frag += '<span class="facetview_filterselected_text">' + range.display + '</span> <i class="icon-white icon-remove" style="margin-top:1px;"></i>'
    frag += "</a>"
    
    frag += "</div>"
    
    return frag        
}

/******************************************************************
 * DEFAULT CALLBACKS AND PLUGINS
 *****************************************************************/
 
///// the lifecycle callbacks ///////////////////////
function postInit(options, context) {}
function preSearch(options, context) {}
function postSearch(options, context) {}
function preRender(options, context) {}
function postRender(options, context) {}

///// behaviour functions //////////////////////////

// called when searching begins.  Use it to show the loading bar, or something
function showSearchingNotification(options, context) {
    $(".facetview_searching", context).show()
}

// called when searching completes.  Use it to hide the loading bar
function hideSearchingNotification(options, context) {
    $(".facetview_searching", context).hide()
}

// called once facet has been populated.  Visibility is calculated for you
// so just need to disable/hide the facet depending on the facet.hide_inactive
// configuration
function setFacetVisibility(options, context, facet, visible) {
    var el = context.find("#facetview_filter_" + safeId(facet.field))
    el.find('.facetview_filtershow').css({'color':'#333','font-weight':'bold'}).children('i').show();
    if (visible) {
        el.show();
    } else {
        if (facet.hide_inactive) {
            el.hide();
        }
        el.find('.facetview_filtershow').css({'color':'#ccc','font-weight':'normal'}).children('i').hide();
    };
}

// called when a request to open or close the facet is received
// this should move the facet to the state dictated by facet.open
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

// set the UI to present the given ordering
function setResultsOrder(options, context, order) {
    if (order === 'asc') {
        $('.facetview_order', context).html('<i class="icon-arrow-up"></i>');
        $('.facetview_order', context).attr('href','asc');
        $('.facetview_order', context).attr('title','current order ascending. Click to change to descending');
    } else {
        $('.facetview_order', context).html('<i class="icon-arrow-down"></i>');
        $('.facetview_order', context).attr('href','desc');
        $('.facetview_order', context).attr('title','current order descending. Click to change to ascending');
    };
}

/******************************************************************
 * URL MANAGEMENT
 *****************************************************************/

function shareableUrl(options, query_part_only, include_fragment) {
    var source = elasticSearchQuery({"options" : options, "include_facets" : options.include_facets_in_url, "include_fields" : options.include_fields_in_url})
    var querypart = "?source=" + encodeURIComponent(serialiseQueryObject(source))
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
 * ELASTICSEARCH INTEGRATION
 *****************************************************************/

var elasticsearch_distance_units = ["km", "mi", "miles", "in", "inch", "yd", "yards", "kilometers", "mm", "millimeters", "cm", "centimeters", "m", "meters"]

function optionsFromQuery(query) {

    function stripDistanceUnits(val) {
        for (var i in elasticsearch_distance_units) {
            var unit = elasticsearch_distance_units[i]
            if (endsWith(val, unit)) {
                return val.substring(0, val.length - unit.length)
            }
        }
        return val
    }
    
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
            opts["_active_filters"] = {}
            opts["_selected_operators"] = {}
        }
        for (var i = 0; i < must.length; i++) {
            var clause = must[i]
            
            // could be a term query (implies AND on this field)
            if ("term" in clause) {
                for (var field in clause.term) {
                    opts["_selected_operators"][field] = "AND"
                    var value = clause.term[field]
                    if (!(field in opts["_active_filters"])) {
                        opts["_active_filters"][field] = []
                    }
                    opts["_active_filters"][field].push(value)
                }
            }
            
            // could be a terms query (implies OR on this field)
            if ("terms" in clause) {
                for (var field in clause.terms) {
                    opts["_selected_operators"][field] = "OR"
                    var values = clause.terms[field]
                    if (!(field in opts["_active_filters"])) {
                        opts["_active_filters"][field] = []
                    }
                    opts["_active_filters"][field] = opts["_active_filters"][field].concat(values)
                }
            }
            
            // could be a range query
            if ("range" in clause) {
                for (var field in clause.range) {
                    var rq = clause.range[field]
                    var range = {}
                    if (rq.lt) { range["to"] = rq.lt }
                    if (rq.gte) { range["from"] = rq.gte }
                    opts["_active_filters"][field] = range
                }
            }
            
            // cound be a geo distance query
            if ("geo_distance_range" in clause) {
                for (var field in clause.geo_distance_range) {
                    var gq = clause.geo_distance_range[field]
                    var range = {}
                    if (gq.lt) { range["to"] = stripDistanceUnits(gq.lt) }
                    if (gq.gte) { range["from"] = stripDistanceUnits(gq.gte) }
                    opts["_active_filters"][field] = range
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
    
    // function to get the right facet from the options, based on the name
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
    
    function termsFilter(facet, filter_list) {
        if (facet.logic === "AND") {
            for (var i in filter_list) {
                var value = filter_list[i]
                var tq = {"term" : {}}
                tq["term"][facet.field] = value
                return tq
            }
        } else if (facet.logic === "OR") {
            var tq = {"terms" : {}}
            tq["terms"][facet.field] = filter_list
            return tq
        }
    }
    
    function rangeFilter(facet, value) {
        var rq = {"range" : {}}
        rq["range"][facet.field] = {}
        if (value.to) { rq["range"][facet.field]["lt"] = value.to }
        if (value.from) { rq["range"][facet.field]["gte"] = value.from }
        return rq
    }
    
    function geoFilter(facet, value) {
        var gq = {"geo_distance_range" : {}}
        gq["geo_distance_range"][facet.field] = {}
        if (value.to) { gq["geo_distance_range"][facet.field]["lt"] = value.to + facet.unit }
        if (value.from) { gq["geo_distance_range"][facet.field]["gte"] = value.from + facet.unit }
        return gq
    }
    
    // function to make the relevant filters from the filter definition
    function makeFilters(filter_definition) {
        var filters = []
        for (var field in filter_definition) {
            var facet = selectFacet(field)
            var filter_list = filter_definition[field]
            
            if (facet.type === "terms") {
                filters.push(termsFilter(facet, filter_list))
            } else if (facet.type === "range") {
                filters.push(rangeFilter(facet, filter_list))
            } else if (facet.type == "geo_distance") {
                filters.push(geoFilter(facet, filter_list))
            }            
        }
        return filters
    }
    
    // read any filters out of the options and create an array of "must" queries which 
    // will constrain the search results
    var filter_must = []
    filter_must = filter_must.concat(makeFilters(options.active_filters))
    filter_must = filter_must.concat(makeFilters(options.predefined_filters))
    
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
            var size = defn.size
            
            // add a bunch of extra values to the facets to deal with the shard count issue
            size += options.elasticsearch_facet_inflation 
            
            var facet = {}
            if (defn.type === "terms") {
                facet["terms"] = {"field" : defn["field"], "size" : size}
            } else if (defn.type === "range") {
                var ranges = []
                for (var r in defn["range"]) {
                    var def = defn["range"][r]
                    var robj = {}
                    if (def.to) { robj["to"] = def.to }
                    if (def.from) { robj["from"] = def.from }
                    ranges.push(robj)
                }
                facet["range"] = { }
                facet["range"][defn.field] = ranges
            } else if (defn.type === "geo_distance") {
                facet["geo_distance"] = {}
                facet["geo_distance"][defn["field"]] = [defn.lon, defn.lat] // note that the order is lon/lat because of GeoJSON
                facet["geo_distance"]["unit"] = defn.unit
                var ranges = []
                for (var r in defn["distance"]) {
                    var def = defn["distance"][r]
                    var robj = {}
                    if (def.to) { robj["to"] = def.to }
                    if (def.from) { robj["from"] = def.from }
                    ranges.push(robj)
                }
                facet["geo_distance"]["ranges"] = ranges
            }
            qs["facets"][defn["field"]] = facet
        }
        
        // and any extra facets
        // NOTE: this does not include any treatment of the facet size inflation that may be required
        $.extend(true, qs['facets'], options.extra_facets );
    }
    
    return qs
}

function fuzzify(querystr, default_freetext_fuzzify) {
    var rqs = querystr
    if (default_freetext_fuzzify !== undefined) {
        if (default_freetext_fuzzify == "*" || default_freetext_fuzzify == "~") {
            if (querystr.indexOf('*') === -1 && querystr.indexOf('~') === -1 && querystr.indexOf(':') === -1) {
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
                var terms = facet["terms"]
                resultobj["facets"][item] = terms
            // handle any range/geo_distance_range facets
            } else if ("ranges" in facet) {
                var range = facet["ranges"]
                resultobj["facets"][item] = range
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
                "type": "term|range|geo_distance",                                  // the kind of facet this will be
                "open" : true|false,                                                // whether the facet should be open or closed (initially)
                
                // terms facet only
                
                "size" : <num>,                                                     // how many terms should the facet limit to
                "logic" : "AND|OR",                                                 // Whether to AND or OR selected facets together when filtering
                "order" : "count|reverse_count|term|reverse_term",                  // which standard ordering to use for facet values
                "deactivate_threshold" : <num>,                                     // number of facet terms below which the facet is disabled
                "hide_inactive" : true|false,                                       // whether to hide or just disable the facet if below deactivate threshold
                
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
            "default_facet_size" : 10,
            "default_facet_operator" : "AND",  // logic
            "default_facet_order" : "count",
            "default_facet_hide_inactive" : false,
            "default_facet_deactivate_threshold" : 0, // equal to or less than this number will deactivate the facet
            "default_hide_empty_range" : true,
            "default_hide_empty_distance" : true,
            "default_distance_unit" : "km",
            "default_distance_lat" : 51.4768,       // Greenwich meridian (give or take a few decimal places)
            "default_distance_lon" : 0.0,           //
            
            ///// search bar configuration /////////////////////////////
            
            // list of options by which the search results can be sorted
            // of the form of a list of: { 'display' : '<display name>', 'field' : '<field to sort by>'},
            "search_sortby" : [],
            
            // list of options for fields to which free text search can be constrained
            // of the form of a list of: { 'display' : '<display name>', 'field' : '<field to search on>'},
            "searchbox_fieldselect" : [],
            
            // enable the share/save link feature
            "sharesave_link" : true,
            
            // on free-text search, default operator for the elasticsearch query system to use
            "default_operator" : "OR",
            
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
            "data" : false
        }
        
        function deriveOptions() {
            // cleanup for ie8 purposes
            ie8compat(options)
            ie8compat(defaults)
            
            // extend the defaults with the provided options
            var provided_options = $.extend(defaults, options);
            
            // deal with the options that come from the url, which require some special treatment
            var url_params = getUrlVars();
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
            
            // tease apart the active filters from the predefined filters
            if (!provided_options.predefined_filters) {
                provided_options["active_filters"] = provided_options._active_filters
                delete provided_options._active_filters
            } else {
                provided_options["active_filters"] = {}
                for (var field in provided_options._active_filters) {
                    var filter_list = provided_options._active_filters[field]
                    provided_options["active_filters"][field] = []
                    if (!(field in provided_options.predefined_filters)) {
                        provided_options["active_filters"][field] = filter_list
                    } else {
                        // FIXME: this does not support pre-defined range queries
                        var predefined_values = provided_options.predefined_filters[field]
                        for (var i in filter_list) {
                            var value = filter_list[i]
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
            
            // copy in the defaults to the individual facets when they are needed
            for (var i in provided_options.facets) {
                var facet = provided_options.facets[i]
                if (!("type" in facet)) { facet["type"] = provided_options.default_facet_type }
                if (!("open" in facet)) { facet["open"] = provided_options.default_facet_open }
                if (!("size" in facet)) { facet["size"] = provided_options.default_facet_size }
                if (!("logic" in facet)) { facet["logic"] = provided_options.default_facet_operator }
                if (!("order" in facet)) { facet["order"] = provided_options.default_facet_order }
                if (!("hide_inactive" in facet)) { facet["hide_inactive"] = provided_options.default_facet_hide_inactive }
                if (!("deactivate_threshold" in facet)) { facet["deactivate_threshold"] = provided_options.default_facet_deactivate_threshold }
                if (!("hide_empty_range" in facet)) { facet["hide_empty_range"] = provided_options.default_hide_empty_range }
                if (!("hide_empty_distance" in facet)) { facet["hide_empty_distance"] = provided_options.default_hide_empty_distance }
                if (!("unit" in facet)) { facet["unit"] = provided_options.default_distance_unit }
                if (!("lat" in facet)) { facet["lat"] = provided_options.default_distance_lat }
                if (!("lon" in facet)) { facet["lon"] = provided_options.default_distance_lon }
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
            // NOTE: that this interface only supports single field ordering
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
                setUIFacetSize({facet : f})
                setUIFacetSort({facet : f})
                setUIFacetAndOr({facet : f})
            }
            
            // for any existing filters, render them
            setUISelectedFilters()
        }
        
        function urlFromOptions() {
            
            if (options.pushstate && 'pushState' in window.history) {
                var querypart = shareableUrl(options, true, true)
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
                setUIPageSize({size: options.page_size});
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
            var order = params.order
            options.behaviour_results_ordering(options, obj, order)
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
            
            facet.open = !facet.open
            setUIFacetOpen(facet)
        };
        
        function setUIFacetOpen(facet) {
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
                setUIFacetSize({facet: morewhat})
                doSearch();
            }
        };
        
        function setUIFacetSize(params) {
            var facet = params.facet
            var el = facetElement("#facetview_facetvals_", facet["field"])
            el.html(facet.size)
        }
        
        /////// sorting facets /////////////////////////////////
        
        function clickSort(event) {
            event.preventDefault();
            var sortwhat = selectFacet($(this).attr('href'));
            
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
            // FIXME: should be a behaviour plugin
            var facet = params.facet
            var el = facetElement("#facetview_sort_", facet["field"])
            if (facet.order === "reverse_term") {
                el.html('a-z <i class="icon-arrow-up"></i>');
            } else if (facet.order === "count") {
                el.html('count <i class="icon-arrow-down"></i>');
            } else if (facet.order === "reverse_count") {
                el.html('count <i class="icon-arrow-up"></i>');
            } else if (facet.order === "term") {
                el.html('a-z <i class="icon-arrow-down"></i>');
            }
        }
        
        /////// AND vs OR on facet selection /////////////////////////////////
        
        // function to switch filters to OR instead of AND
        function clickOr(event) {
            event.preventDefault();
            var orwhat = selectFacet($(this).attr('href'));
            
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
            if (facet.logic === "OR") {
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
            
            var frag = undefined
            if (facet.type === "terms") {
                frag = options.render_terms_facet_values(options, facet)
            } else if (facet.type === "range") {
                frag = options.render_range_facet_values(options, facet)
            } else if (facet.type === "geo_distance") {
                frag = options.render_geo_facet_values(options, facet)
            }
            if (frag) {
                el.append(frag)
            }
            
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
            var facet = selectFacet(field)
            var value = {}
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
            }
            
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
            // make space for the filter in the active filters list
            if (!(field in options.active_filters)) {
                options.active_filters[field] = []
            }
            
            var facet = selectFacet(field)
            
            if (facet.type === "terms") {
                // get the current values for that filter
                var filter = options.active_filters[field]
                if ($.inArray(value, filter) === -1 ) {
                    filter.push(value)
                }
            } else if (facet.type === "range") {
                // NOTE: we are implicitly stating that range filters cannot be OR'd
                options.active_filters[field] = value
            } else if (facet.type === "geo_distance") {
                // NOTE: we are implicitly stating that geo distance range filters cannot be OR'd
                options.active_filters[field] = value
            }
        }
        
        function deSelectFilter(facet, field, value) {
            if (field in options.active_filters) {
                var filter = options.active_filters[field]
                if (facet.type === "terms") {
                    var index = $.inArray(value, filter)
                    filter.splice(index, 1)
                    if (filter.length === 0) {
                        delete options.active_filters[field]
                    }
                } else if (facet.type === "range") {
                    delete options.active_filters[field]
                } else if (facet.type === "geo_distance") {
                    delete options.active_filters[field]
                }
            }
        }
        
        function setUISelectedFilters() {
            var frag = ""
            for (var field in options.active_filters) {
                var filter_list = options.active_filters[field]
                var facet = selectFacet(field)
                if (facet.type === "terms") {
                    frag += options.render_active_terms_filter(options, facet, field, filter_list)
                } else if (facet.type === "range") {
                    frag += options.render_active_range_filter(options, facet, field, filter_list)
                } else if (facet.type === "geo_distance") {
                    frag += options.render_active_geo_filter(options, facet, field, filter_list)
                }
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
            var facet = selectFacet(field)
            var value = {}
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
            }
            
            deSelectFilter(facet, field, value)
            setUISelectedFilters()
            
            // reset the result set to the beginning and search again
            options.from = 0;
            doSearch();
        }
        
        function facetVisibility() {
            $('.facetview_filters', obj).each(function() {
                var facet = selectFacet($(this).attr('data-href'));
                var values = "values" in facet ? facet["values"] : []
                var visible = true
                if (facet.type === "terms") {
                    // terms facet becomes deactivated if the number of results is less than the deactivate threshold defined
                    visible = facet.deactivate_threshold <= values.length
                } else if (facet.type === "range") {
                    // range facet becomes deactivated if there is a count of 0 in every value
                    var view = false
                    for (var i in facet.values) {
                        var val = facet.values[i]
                        if (val.count > 0) {
                            view = true
                            break
                        }
                    }
                    visible = view
                } else if (facet.type === "geo_distance") {
                    // distance facet becomes deactivated if there is a count of 0 in every value
                    var view = false
                    for (var i in facet.values) {
                        var val = facet.values[i]
                        if (val.count > 0) {
                            view = true
                            break
                        }
                    }
                    visible = view
                }
                options.behaviour_facet_visibility(options, obj, facet, visible)
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
