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
    var showfacets = false
    for (var i = 0; i < options.facets.length; i++) {
        var f = options.facets[i]
        if (!f.hidden) {
            showfacets = true;
            break;
        }
    }
    if (showfacets) {
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
     * class: facetview_force_search - button which triggers a search on the current page status
     *
     * should (not must) respect the following configs
     *
     * options.search_sortby - list of sort fields and directions
     * options.searchbox_fieldselect - list of fields search can be focussed on
     * options.sharesave_link - whether to provide a copy of a link which can be saved
     * options.search_button - whether to provide a button to force a search
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
    var corners = "border-radius:0px 5px 5px 0px; -moz-border-radius:0px 5px 5px 0px; -webkit-border-radius:0px 5px 5px 0px;"
    if (options.search_button) {
        corners = "border-radius:0px 0px 0px 0px; -moz-border-radius:0px 0px 0px 0px; -webkit-border-radius:0px 0px 0px 0px;"
    }
    thefacetview += '<input type="text" class="facetview_freetext span4" style="display:inline-block; margin:0 0 21px 0; background:#ecf4ff; ' + corners + '" name="q" \
        value="" placeholder="search term" />';

    // search button
    if (options.search_button) {
        thefacetview += "<a class='btn btn-info facetview_force_search' style='margin:0 0 21px 0px; border-radius:0px 5px 5px 0px; \
            -moz-border-radius:0px 5px 5px 0px; -webkit-border-radius:0px 5px 5px 0px;'><i class='icon-white icon-search'></i></a>"
    }

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
     * options.facet[x].hidden - whether the facet should be displayed in the UI or not
     * options.render_terms_facet - renders a term facet into the list
     * options.render_range_facet - renders a range facet into the list
     * options.render_geo_facet - renders a geo distance facet into the list
     */
    if (options.facets.length > 0) {
        var filters = options.facets;
        var thefilters = '';
        for (var idx = 0; idx < filters.length; idx++) {
            var facet = filters[idx]
            // if the facet is hidden do not include it in this list
            if (facet.hidden) {
                continue;
            }

            var type = facet.type ? facet.type : "terms"
            if (type === "terms") {
                thefilters += options.render_terms_facet(facet, options)
            } else if (type === "range") {
                thefilters += options.render_range_facet(facet, options)
            } else if (type === "geo_distance") {
                thefilters += options.render_geo_facet(facet, options)
            }
            // FIXME: statistical facet and terms_stats facet?
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
     * facet.value_function - the value function to be applied to all displayed values
     */
    var selected_filters = options.active_filters[facet.field]
    var frag = ""

    // first render the active filters
    if (options.selected_filters_in_facet) {
        if (selected_filters) {
            for (var i=0; i < selected_filters.length; i=i+1) {
                var value = selected_filters[i]
                if (facet.value_function) {
                    value = facet.value_function(value)
                }
                var sf = '<tr class="facetview_filtervalue" style="display:none;"><td>'
                sf += "<strong>" + value + "</strong> "
                sf += '<a class="facetview_filterselected facetview_clear" data-field="' + facet.field + '" data-value="' + value + '" href="' + value + '"><i class="icon-black icon-remove" style="margin-top:1px;"></i></a>'
                sf += "</td></tr>"
                frag += sf
            }
        }
    }

    // is there a pre-defined filter on this facet?
    var predefined = facet.field in options.predefined_filters ? options.predefined_filters[facet.field] : []

    // then render the remaining selectable facets
    for (var i=0; i < facet["values"].length; i=i+1) {
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
        for (var i=0; i < values.length; i=i+1) {
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
        for (var i=0; i < facet.range.length; i=i+1) {
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
    for (var i=0; i < facet["range"].length; i=i+1) {
        var r = facet["range"][i]
        var f = getValueForRange(r, facet["values"])
        if (f) {
            if (f.count === 0 && facet.hide_empty_range) {
                continue
            }
            var append = options.render_range_facet_result(options, facet, f, r)
            frag += append
        }
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
        for (var i=0; i < values.length; i=i+1) {
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
        for (var i=0; i < facet.distance.length; i=i+1) {
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
    for (var i=0; i < facet["distance"].length; i=i+1) {
        var r = facet["distance"][i]
        var f = getValueForRange(r, facet["values"])
        if (f) {
            if (f.count === 0 && facet.hide_empty_distance) {
                continue
            }
            var append = options.render_geo_facet_result(options, facet, f, r)
            frag += append
        }
    }

    return frag
}

function renderTermsFacetResult(options, facet, result, selected_filters) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: facetview_filtervalue - tags the top level element as being a facet result
     * class: facetview_filterchoice - tags the anchor wrapped around the name of the field
     *
     * should (not must) respect the following configuration:
     *
     * facet.value_function - the value function to be applied to all displayed values
     */

    var display = result.term
    if (facet.value_function) {
        display = facet.value_function(display)
    }
    var append = '<tr class="facetview_filtervalue" style="display:none;"><td><a class="facetview_filterchoice' +
                '" data-field="' + facet['field'] + '" data-value="' + result.term + '" href="' + result.term +
                '"><span class="facetview_filterchoice_text">' + display + '</span>' +
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
    var from = parseInt(options.from);
    var size = parseInt(options.page_size);

    // calculate the human readable values we want
    var to = from + size;
    from = from + 1; // zero indexed
    if (options.data.found < to) { to = options.data.found }
    var total = options.data.found;

    // forward and back-links, taking into account start and end boundaries
    var backlink = '<a alt="previous" title="previous" class="facetview_decrement" style="color:#333;float:left;padding:0 40px 20px 20px;"><span class="icon icon-arrow-left"></span></a>'
    if (from < size) {
        backlink = '<a class="facetview_decrement facetview_inactive_link" style="color:#333;float:left;padding:0 40px 20px 20px;">&nbsp;</a>'
    }

    var nextlink = '<a alt="next" title="next" class="facetview_increment" style="color:#333;float:right;padding:0 20px 20px 40px;"><span class="icon icon-arrow-right"></span></a>'
    if (options.data.found <= to) {
        nextlink = '<a class="facetview_increment facetview_inactive_link" style="color:#333;float:right;padding:0 20px 20px 40px;">&nbsp;</a>'
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
        var line = "";
        for (var object = 0; object < display[lineitem].length; object++) {
            var thekey = display[lineitem][object]['field'];
            var thevalue = "";
            if (typeof options.results_render_callbacks[thekey] == 'function') {
                // a callback is defined for this field so just call it
                thevalue = options.results_render_callbacks[thekey].call(this, record);
            } else {
                // split the key up into its parts, and work our way through the
                // tree until we get to the node to display.  Note that this will only
                // work with a string hierarchy of dicts - it can't have lists in it
                var parts = thekey.split('.');
                var res = record;
                for (var i = 0; i < parts.length; i++) {
                    if (res) {
                        res = res[parts[i]]
                    } else {
                        continue
                    }
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
     * facet.value_function - the value function to be applied to all displayed values
     */
    var clean = safeId(field)
    var display = facet.display ? facet.display : facet.field
    var logic = facet.logic ? facet.logic : options.default_facet_operator

    var frag = "<div id='facetview_filter_group_" + clean + "' class='btn-group'>";

    if (options.show_filter_field) {
        frag += '<a class="btn btn-info facetview_inactive_link facetview_filterselected" href="' + field + '">'
        frag += '<span class="facetview_filterselected_text"><strong>' + display + '</strong></span>'
        frag += "</a>"
    }

    for (var i = 0; i < filter_list.length; i++) {
        var value = filter_list[i]
        if (facet.value_function) {
            value = facet.value_function(value)
        }

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
        for (var i=0; i < facet.range.length; i=i+1) {
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

    var frag = "<div id='facetview_filter_group_" + clean + "' class='btn-group'>"

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
        for (var i=0; i < facet.distance.length; i=i+1) {
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

    var frag = "<div id='facetview_filter_group_" + clean + "' class='btn-group'>"

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
    }
}

// set the UI to present the given page size
function setUIPageSize(options, context, params) {
    var size = params.size;
    $('.facetview_pagesize', context).html(size);
}

// set the UI to present the given ordering
function setUIOrder(options, context, params) {
    var order = params.order;
    options.behaviour_results_ordering(options, context, order)
}

// set the UI to present the order by field
function setUIOrderBy(options, context, params) {
    var orderby = params.orderby;
    $(".facetview_orderby", context).val(orderby)
}

function setUISearchField(options, context, params) {
    var field = params.field;
    $(".facetview_searchfield", context).val(field)
}

function setUISearchString(options, context, params) {
    var q = params.q;
    $(".facetview_freetext", context).val(q)
}

function setUIFacetSize(options, context, params) {
    var facet = params.facet;
    var el = facetElement("#facetview_facetvals_", facet["field"], context);
    el.html(facet.size)
}

function setUIFacetSort(options, context, params) {
    var facet = params.facet
    var el = facetElement("#facetview_sort_", facet["field"], context);
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

function setUIFacetAndOr(options, context, params) {
    var facet = params.facet
    var el = facetElement("#facetview_or_", facet["field"], context);
    if (facet.logic === "OR") {
        el.css({'color':'#333'});

        // FIXME: resolve this when we get to the filter display
        $('.facetview_filterselected[rel="' + $(this).attr('href') + '"]', context).addClass('facetview_logic_or');
    } else {
        el.css({'color':'#aaa'});

        // FIXME: resolve this when we got to the filter display
        $('.facetview_filterselected[rel="' + $(this).attr('href') + '"]', context).removeClass('facetview_logic_or');
    }
}

function setUISelectedFilters(options, context) {
    var frag = "";
    for (var field in options.active_filters) {
        if (options.active_filters.hasOwnProperty(field)) {
            var filter_list = options.active_filters[field];
            var facet = selectFacet(options, field);
            if (facet.type === "terms") {
                frag += options.render_active_terms_filter(options, facet, field, filter_list)
            } else if (facet.type === "range") {
                frag += options.render_active_range_filter(options, facet, field, filter_list)
            } else if (facet.type === "geo_distance") {
                frag += options.render_active_geo_filter(options, facet, field, filter_list)
            }
            // FIXME: statistical facet?
        }
    }
    $('#facetview_selectedfilters', context).html(frag);
}