// What each network's ads manager actually offers at each level, so a plan only uses settings that exist there.
// Researched 2026-10-10 from each network's API reference and help center (sources below). Networks change these:
// when one does, update this file. A value marked confirm: true couldn't be checked against an official page and is
// shown in the canvas and the brief with "confirm in ads manager".
//
// Per network:
//   levels          what the network calls campaign / ad set / ad
//   objectives      native objectives: { id, label, generic, goals: [{ id, label }], destinations?: [...] }
//   bid             { level: "campaign" | "adset" | "budget" (wherever the budget is), strategies: [{ id, label, amount? }] }
//   budget          { levels: { campaign?: label, adset?: label }, minDaily: { campaign?, adset? } (USD) }
//   special         special ad categories that restrict targeting, if the network has them
//   geoLevel        "campaign" when locations and languages are campaign settings (Google), else "adset"
//   age             { kind: "range", min, max, plusAt } | { kind: "buckets", options } | null (no age targeting)
//   genders         options
//   targeting       ad set targeting dimensions beyond location, language, age and gender: [{ key, label }]
//   placements      { automatic: label, options: [{ id, label }] } (or networks for Google)

export const CATALOG = {
	meta: {
		sources: ["developers.facebook.com/docs/marketing-api/reference/ad-campaign-group", "developers.facebook.com/docs/marketing-api/reference/ad-campaign", "developers.facebook.com/docs/marketing-api/audiences/reference/placement-targeting", "developers.facebook.com/docs/marketing-api/audiences/reference/basic-targeting", "jonloomer.com/performance-goals"],
		objectives: [
			{ id: "OUTCOME_AWARENESS", label: "Awareness", generic: "awareness", goals: [["REACH", "Maximize reach of ads"], ["IMPRESSIONS", "Maximize number of impressions"], ["AD_RECALL_LIFT", "Maximize ad recall lift"], ["THRUPLAY", "Maximize ThruPlay views"], ["TWO_SECOND_VIDEO_VIEWS", "Maximize 2-second continuous video views"]] },
			{ id: "OUTCOME_TRAFFIC", label: "Traffic", generic: "traffic", destinations: ["Website", "App", "Messaging apps", "Instagram profile", "Calls"], goals: [["LANDING_PAGE_VIEWS", "Maximize number of landing page views"], ["LINK_CLICKS", "Maximize number of link clicks"], ["REACH", "Maximize daily unique reach"], ["CONVERSATIONS", "Maximize number of conversations"], ["IMPRESSIONS", "Maximize number of impressions"], ["QUALITY_CALL", "Maximize number of calls"], ["VISIT_INSTAGRAM_PROFILE", "Maximize Instagram profile visits"]] },
			{ id: "OUTCOME_ENGAGEMENT", label: "Engagement", generic: "engagement", destinations: ["On your ad", "Messaging apps", "Website", "App", "Facebook Page", "Calls"], goals: [["POST_ENGAGEMENT", "Maximize engagement with a post"], ["THRUPLAY", "Maximize ThruPlay views"], ["TWO_SECOND_VIDEO_VIEWS", "Maximize 2-second continuous video views"], ["EVENT_RESPONSES", "Maximize event responses"], ["REMINDERS_SET", "Maximize reminders set"], ["PAGE_LIKES", "Maximize Page likes"], ["CONVERSATIONS", "Maximize number of conversations"], ["OFFSITE_CONVERSIONS", "Maximize number of conversions"], ["LANDING_PAGE_VIEWS", "Maximize number of landing page views"], ["LINK_CLICKS", "Maximize number of link clicks"], ["REACH", "Maximize daily unique reach"], ["IMPRESSIONS", "Maximize number of impressions"], ["QUALITY_CALL", "Maximize number of calls"]] },
			{ id: "OUTCOME_LEADS", label: "Leads", generic: "leads", destinations: ["Website", "Instant forms", "Messenger", "Instagram", "Instant forms and Messenger", "Calls", "App"], goals: [["LEAD_GENERATION", "Maximize number of leads"], ["QUALITY_LEAD", "Maximize number of conversion leads"], ["OFFSITE_CONVERSIONS", "Maximize number of conversions"], ["LANDING_PAGE_VIEWS", "Maximize number of landing page views"], ["LINK_CLICKS", "Maximize number of link clicks"], ["REACH", "Maximize daily unique reach"], ["IMPRESSIONS", "Maximize number of impressions"], ["QUALITY_CALL", "Maximize number of calls"], ["APP_EVENTS", "Maximize number of app events"]] },
			{ id: "OUTCOME_APP_PROMOTION", label: "App promotion", generic: "app", destinations: ["App"], goals: [["APP_INSTALLS", "Maximize number of app installs"], ["APP_EVENTS", "Maximize number of app events"], ["VALUE", "Maximize value of conversions"], ["LINK_CLICKS", "Maximize number of link clicks"]] },
			{ id: "OUTCOME_SALES", label: "Sales", generic: "sales", destinations: ["Website", "App", "Website and app", "Messaging apps", "Calls"], goals: [["OFFSITE_CONVERSIONS", "Maximize number of conversions"], ["VALUE", "Maximize value of conversions"], ["LANDING_PAGE_VIEWS", "Maximize number of landing page views"], ["LINK_CLICKS", "Maximize number of link clicks"], ["REACH", "Maximize daily unique reach"], ["IMPRESSIONS", "Maximize number of impressions"], ["CONVERSATIONS", "Maximize number of conversations"], ["QUALITY_CALL", "Maximize number of calls"], ["APP_EVENTS", "Maximize number of app events"]] },
		],
		bid: { level: "budget", strategies: [["LOWEST_COST_WITHOUT_CAP", "Highest volume"], ["COST_CAP", "Cost per result goal", "amount"], ["LOWEST_COST_WITH_BID_CAP", "Bid cap", "amount"], ["LOWEST_COST_WITH_MIN_ROAS", "ROAS goal", "roas"]] },
		budget: { levels: { campaign: "Advantage+ campaign budget", adset: "Ad set budget" }, minDaily: { adset: 1 } },
		special: [["NONE", "None"], ["FINANCIAL_PRODUCTS_SERVICES", "Financial products and services"], ["EMPLOYMENT", "Employment"], ["HOUSING", "Housing"], ["ISSUES_ELECTIONS_POLITICS", "Social issues, elections or politics"], ["ONLINE_GAMBLING_AND_GAMING", "Online gambling and gaming"]],
		geoLevel: "adset",
		age: { kind: "range", min: 13, max: 65, plusAt: 65, default: [18, 65] },
		genders: [["all", "All"], ["male", "Men"], ["female", "Women"]],
		targeting: [["detailedTargeting", "Detailed targeting (interests, demographics, behaviors)"], ["customAudiences", "Custom audiences"], ["lookalikes", "Lookalike audiences"], ["exclusions", "Excluded custom audiences"]],
		placements: {
			automatic: "Advantage+ placements",
			options: [["facebook:feed", "Facebook Feed"], ["facebook:profile_feed", "Facebook profile feed"], ["facebook:marketplace", "Facebook Marketplace"], ["facebook:video_feeds", "Facebook video feeds"], ["facebook:right_hand_column", "Facebook right column"], ["facebook:story", "Facebook Stories"], ["facebook:facebook_reels", "Facebook Reels"], ["facebook:search", "Facebook search results"], ["facebook:instream_video", "Facebook in-stream video"], ["instagram:stream", "Instagram feed"], ["instagram:profile_feed", "Instagram profile feed"], ["instagram:explore", "Instagram Explore"], ["instagram:explore_home", "Instagram Explore home"], ["instagram:story", "Instagram Stories"], ["instagram:reels", "Instagram Reels"], ["instagram:ig_search", "Instagram search results"], ["messenger:story", "Messenger Stories"], ["messenger:sponsored_messages", "Messenger sponsored messages"], ["threads:threads_stream", "Threads feed"], ["audience_network:classic", "Audience Network native, banner and interstitial"], ["audience_network:rewarded_video", "Audience Network rewarded video"]],
		},
	},
	google: {
		sources: ["support.google.com/google-ads/answer/7450050", "developers.google.com/google-ads/api/reference/rpc (AdvertisingChannelType, BiddingStrategyType, AgeRangeType, CallToActionType)", "support.google.com/google-ads/answer/7684791"],
		objectives: [
			{ id: "SALES", label: "Sales", generic: "sales", goals: [] },
			{ id: "LEADS", label: "Leads", generic: "leads", goals: [] },
			{ id: "WEBSITE_TRAFFIC", label: "Website traffic", generic: "traffic", goals: [] },
			{ id: "APP_PROMOTION", label: "App promotion", generic: "app", goals: [] },
			{ id: "YOUTUBE_REACH", label: "YouTube reach, views, and engagements", generic: "awareness", goals: [] },
			{ id: "LOCAL", label: "Local store visits and promotions", generic: "sales", goals: [] },
			{ id: "NONE", label: "Create a campaign without guidance", generic: "traffic", goals: [] },
		],
		// Google sets bidding on the campaign, and it depends on the campaign type.
		campaignTypes: [
			["SEARCH", "Search", ["search"], ["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE", "TARGET_SPEND", "TARGET_IMPRESSION_SHARE", "MANUAL_CPC"]],
			["PERFORMANCE_MAX", "Performance Max", ["display", "youtube", "search"], ["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"]],
			["DEMAND_GEN", "Demand Gen", ["display", "youtube"], ["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE", "TARGET_SPEND", "TARGET_CPA"]],
			["DISPLAY", "Display", ["display"], ["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE", "TARGET_SPEND", "MANUAL_CPC", "TARGET_CPM"]],
			["VIDEO", "Video", ["youtube"], ["TARGET_CPM", "TARGET_CPV", "MAXIMIZE_CONVERSIONS", "TARGET_CPA"]],
		],
		bid: { level: "campaign", strategies: [["MAXIMIZE_CONVERSIONS", "Maximize conversions (optional target CPA)", "amount"], ["MAXIMIZE_CONVERSION_VALUE", "Maximize conversion value (optional target ROAS)", "roas"], ["TARGET_SPEND", "Maximize clicks"], ["TARGET_IMPRESSION_SHARE", "Target impression share"], ["MANUAL_CPC", "Manual CPC", "amount"], ["TARGET_CPA", "Target CPA", "amount"], ["TARGET_CPM", "Target CPM", "amount"], ["TARGET_CPV", "Target CPV", "amount"]] },
		budget: { levels: { campaign: "Campaign budget (average daily)" }, minDaily: {} },
		geoLevel: "campaign",
		networks: [["search", "Google Search Network"], ["search_partners", "Search partners"], ["display", "Google Display Network"]],
		age: { kind: "buckets", options: [["AGE_RANGE_18_24", "18-24"], ["AGE_RANGE_25_34", "25-34"], ["AGE_RANGE_35_44", "35-44"], ["AGE_RANGE_45_54", "45-54"], ["AGE_RANGE_55_64", "55-64"], ["AGE_RANGE_65_UP", "65+"], ["AGE_RANGE_UNDETERMINED", "Unknown"]] },
		genders: [["all", "All"], ["MALE", "Male"], ["FEMALE", "Female"], ["UNDETERMINED", "Unknown"]],
		targeting: [["keywords", "Keywords (Search: \"phrase\", [exact] or broad)"], ["negativeKeywords", "Negative keywords"], ["audienceSegments", "Audience segments"], ["customAudiences", "Your data segments (customer lists, site visitors)"]],
		placements: null,
	},
	tiktok: {
		sources: ["ads.tiktok.com/resources/help/article/ad-targeting", "ads.tiktok.com/resources/help/article/tiktok-placement", "ads.tiktok.com/resources/help/article/campaign-set-up", "ads.tiktok.com/resources/help/article/sales-advertising-objective-tiktok", "ads.tiktok.com/resources/help/article/reach-objective"],
		objectives: [
			{ id: "REACH", label: "Reach", generic: "awareness", goals: [["REACH", "Reach"]] },
			{ id: "TRAFFIC", label: "Traffic", generic: "traffic", destinations: ["Website", "App"], goals: [["CLICK", "Click"], ["LANDING_PAGE_VIEW", "Landing page view"]] },
			{ id: "VIDEO_VIEWS", label: "Video views", generic: "video_views", goals: [["ENGAGED_VIEW", "6-second views (focused view)"], ["VIDEO_VIEW", "2-second views"]] },
			{ id: "ENGAGEMENT", label: "Community interaction", generic: "engagement", goals: [["FOLLOWERS", "Follows"], ["PROFILE_VIEWS", "Profile visits"]] },
			{ id: "APP_PROMOTION", label: "App promotion", generic: "app", destinations: ["App"], goals: [["INSTALL", "Install"], ["IN_APP_EVENT", "In-app event"], ["VALUE", "Value"]] },
			{ id: "LEAD_GENERATION", label: "Lead generation", generic: "leads", destinations: ["Instant form", "Website"], goals: [["LEAD_GENERATION", "Leads"], ["CONVERT", "Conversion (website form)"]] },
			{ id: "SALES", label: "Sales", generic: "sales", destinations: ["Website", "App", "Website and app", "TikTok Shop"], goals: [["CONVERT", "Conversion"], ["VALUE", "Value"], ["LANDING_PAGE_VIEW", "Landing page view"]] },
		],
		bid: { level: "adset", strategies: [["MAXIMUM_DELIVERY", "Maximum delivery"], ["COST_CAP", "Cost cap", "amount"], ["BID_CAP", "Bid cap", "amount"], ["TARGET_ROAS", "Target ROAS", "roas"], ["HIGHEST_VALUE", "Highest value"]] },
		budget: { levels: { campaign: "Campaign budget optimization", adset: "Ad group budget" }, minDaily: { campaign: 50, adset: 20 } },
		special: [["NONE", "None"], ["HOUSING", "Housing"], ["EMPLOYMENT", "Employment"], ["CREDIT", "Credit"]],
		geoLevel: "adset",
		age: { kind: "buckets", options: [["AGE_13_17", "13-17"], ["AGE_18_24", "18-24"], ["AGE_25_34", "25-34"], ["AGE_35_44", "35-44"], ["AGE_45_54", "45-54"], ["AGE_55_100", "55+"]] },
		genders: [["all", "All"], ["MALE", "Male"], ["FEMALE", "Female"]],
		targeting: [["interests", "Interests"], ["purchaseIntent", "Purchase intent"], ["behaviors", "Video and creator interactions"], ["hashtags", "Hashtags"], ["customAudiences", "Custom audiences"], ["lookalikes", "Lookalike audiences"], ["exclusions", "Excluded audiences"], ["devices", "Device, OS and connection"], ["spendingPower", "Spending power / household income (US)"]],
		placements: { automatic: "Automatic placement", options: [["PLACEMENT_TIKTOK", "TikTok (For You, Following, Search, Profile)"], ["PLACEMENT_PANGLE", "TikTok Ad Network"], ["PLACEMENT_LEMON8", "Lemon8 (US, JP, TH, SG, MY, ID)"]] },
	},
	linkedin: {
		sources: ["linkedin.com/help/lms/answer/a424570", "learn.microsoft.com/linkedin/marketing (campaigns, targeting facets: AGE_18_24, AGE_25_34, AGE_35_54, AGE_55_PLUS)"],
		objectives: [
			{ id: "BRAND_AWARENESS", label: "Brand awareness", generic: "awareness", goals: [["MAX_REACH", "Reach"], ["MAX_IMPRESSION", "Impressions"]] },
			{ id: "WEBSITE_VISIT", label: "Website visits", generic: "traffic", goals: [["MAX_CLICK", "Landing page clicks"]] },
			{ id: "ENGAGEMENT", label: "Engagement", generic: "engagement", goals: [["MAX_ENGAGEMENT", "Engagement clicks"]] },
			{ id: "VIDEO_VIEW", label: "Video views", generic: "video_views", goals: [["MAX_VIDEO_VIEW", "Video views"]] },
			{ id: "LEAD_GENERATION", label: "Lead generation", generic: "leads", goals: [["MAX_QUALIFIED_LEAD", "Qualified leads"], ["MAX_LEAD", "Leads"]] },
			{ id: "WEBSITE_CONVERSION", label: "Website conversions", generic: "sales", goals: [["MAX_CONVERSION", "Website conversions"]] },
			{ id: "JOB_APPLICANT", label: "Job applicants", generic: "traffic", goals: [["MAX_CLICK", "Landing page clicks"]] },
		],
		bid: { level: "adset", strategies: [["MAXIMUM_DELIVERY", "Maximum delivery"], ["COST_CAP", "Cost cap", "amount"], ["MANUAL", "Manual bidding", "amount"]] },
		budget: { levels: { campaign: "Campaign budget", adset: "Ad set budget" }, minDaily: { adset: 10 } },
		geoLevel: "adset",
		age: { kind: "buckets", options: [["AGE_18_24", "18-24"], ["AGE_25_34", "25-34"], ["AGE_35_54", "35-54"], ["AGE_55_PLUS", "55+"]] },
		genders: [["all", "All"], ["MALE", "Male"], ["FEMALE", "Female"]],
		targeting: [["jobTitles", "Job titles"], ["jobFunctions", "Job functions"], ["seniorities", "Job seniorities"], ["industries", "Company industries"], ["companySizes", "Company sizes"], ["companyNames", "Company names"], ["skills", "Member skills"], ["groups", "Member groups"], ["customAudiences", "Matched audiences (contact, company, website)"], ["exclusions", "Exclusions"]],
		placements: { automatic: "LinkedIn and LinkedIn Audience Network", options: [["LINKEDIN", "LinkedIn"], ["AUDIENCE_NETWORK", "LinkedIn Audience Network"]] },
	},
	reddit: {
		sources: ["business.reddithelp.com/s/article/Overview-Reddit-Ads-Audience-and-Targeting"],
		objectives: [
			{ id: "BRAND_AWARENESS_AND_REACH", label: "Brand awareness and reach", generic: "awareness", goals: [["IMPRESSIONS", "Impressions"]] },
			{ id: "TRAFFIC", label: "Traffic", generic: "traffic", goals: [["CLICKS", "Clicks"], ["LANDING_PAGE_VIEWS", "Landing page views"]], confirm: true },
			{ id: "VIDEO_VIEWS", label: "Video views", generic: "video_views", goals: [["VIDEO_VIEWABLE_IMPRESSIONS", "Video views"]] },
			{ id: "ENGAGEMENT", label: "Engagement", generic: "engagement", goals: [["ENGAGEMENTS", "Engagements"]], confirm: true },
			{ id: "CONVERSIONS", label: "Conversions", generic: "sales", goals: [["PURCHASE", "Purchase"], ["LEAD", "Lead"], ["SIGN_UP", "Sign up"], ["ADD_TO_CART", "Add to cart"], ["PAGE_VISIT", "Page visit"]] },
			{ id: "LEAD_GENERATION", label: "Lead generation", generic: "leads", goals: [["LEADS", "Lead form submissions"]], confirm: true },
			{ id: "APP_INSTALLS", label: "App installs", generic: "app", goals: [["APP_INSTALLS", "App installs"]] },
			{ id: "CATALOG_SALES", label: "Catalog sales", generic: "sales", goals: [["PURCHASE", "Purchase"]] },
		],
		bid: { level: "adset", strategies: [["LOWEST_COST", "Lowest cost"], ["COST_CAP", "Cost cap", "amount"], ["MANUAL_BIDDING", "Manual bid", "amount"]] },
		budget: { levels: { campaign: "Campaign budget optimization", adset: "Ad group budget" }, minDaily: { adset: 5 } },
		geoLevel: "adset",
		// Reddit targets demographics by location, gender and language only.
		age: null,
		genders: [["all", "All"], ["MALE", "Male"], ["FEMALE", "Female"]],
		targeting: [["communities", "Communities"], ["interests", "Interests"], ["keywords", "Keywords (English)"], ["customAudiences", "Custom audiences (customer lists, website and engagement retargeting)"], ["lookalikes", "Lookalike audiences"], ["exclusions", "Excluded audiences"], ["devices", "Devices and carriers"]],
		placements: { automatic: "All placements", options: [["FEED", "Feed"], ["COMMENTS_PAGE", "Conversation (comments)"]] },
	},
	x: {
		sources: ["business.x.com/en/help/campaign-setup/campaigns-101", "help.x.com/en/business-and-advertising/geo-gender-and-language-targeting"],
		objectives: [
			{ id: "REACH", label: "Reach", generic: "awareness", goals: [["REACH", "Reach"]] },
			{ id: "ENGAGEMENTS", label: "Engagements", generic: "engagement", goals: [["ENGAGEMENT", "Engagements"]] },
			{ id: "VIDEO_VIEWS", label: "Video views", generic: "video_views", goals: [["VIEW_3S_100PCT", "3-second / 100% views"], ["VIEW_15S", "15-second views"]], confirm: true },
			{ id: "PREROLL_VIEWS", label: "Pre-roll views", generic: "video_views", goals: [["VIEW_3S_100PCT", "3-second / 100% views"]], confirm: true },
			{ id: "APP_INSTALLS", label: "App installs", generic: "app", goals: [["APP_INSTALLS", "Installs"], ["APP_CLICKS", "App clicks"]] },
			{ id: "WEBSITE_CLICKS", label: "Website traffic", generic: "traffic", goals: [["LINK_CLICKS", "Link clicks"], ["SITE_VISITS", "Site visits"]], confirm: true },
			{ id: "WEBSITE_CONVERSIONS", label: "Website conversions", generic: "sales", goals: [["WEBSITE_CONVERSIONS", "Conversions"]], confirm: true },
			{ id: "FOLLOWERS", label: "Followers", generic: "engagement", goals: [["FOLLOWERS", "Followers"]] },
		],
		bid: { level: "adset", strategies: [["AUTO", "Autobid"], ["TARGET", "Target cost", "amount"], ["MAX", "Maximum bid", "amount"]] },
		budget: { levels: { campaign: "Campaign daily budget" }, minDaily: {} },
		geoLevel: "adset",
		age: { kind: "x", from: [13, 18, 21, 25, 35, 50], to: [24, 34, 49, 54, 0] },
		genders: [["all", "Any"], ["MALE", "Male"], ["FEMALE", "Female"]],
		targeting: [["keywords", "Keywords"], ["followerLookalikes", "Follower look-alikes (@handles)"], ["interests", "Interests"], ["conversationTopics", "Conversation topics"], ["customAudiences", "Custom audiences"], ["exclusions", "Excluded audiences"], ["devices", "Devices and carriers"]],
		placements: { automatic: "All placements", options: [["TIMELINES", "Home timelines"], ["PROFILES", "Profiles"], ["SEARCH_RESULTS", "Search results"], ["REPLIES", "Replies"], ["X_AUDIENCE_PLATFORM", "X Audience Platform"]] },
	},
	pinterest: {
		sources: ["help.pinterest.com/en/business/article/campaign-objectives", "help.pinterest.com/en/business/article/targeting-overview", "help.pinterest.com/en/business/article/age-targeting"],
		objectives: [
			{ id: "AWARENESS", label: "Brand awareness", generic: "awareness", goals: [["IMPRESSION", "Impressions"]] },
			{ id: "VIDEO_COMPLETION", label: "Video completion", generic: "video_views", goals: [["VIDEO_COMPLETION", "Video completions"]] },
			{ id: "CONSIDERATION", label: "Consideration", generic: "traffic", goals: [["PIN_CLICK", "Pin clicks"], ["OUTBOUND_CLICK", "Outbound clicks"]] },
			{ id: "LEADS", label: "Leads", generic: "leads", goals: [["LEAD", "Leads"]] },
			{ id: "CONVERSIONS", label: "Sales", generic: "sales", goals: [["CHECKOUT", "Checkout"], ["ADD_TO_CART", "Add to cart"], ["SIGNUP", "Sign up"], ["LEAD", "Lead"], ["PAGE_VISIT", "Page visit"]] },
		],
		bid: { level: "adset", strategies: [["AUTOMATIC_BID", "Performance+ (automatic)"], ["MAX_BID", "Custom: maximum CPM or CPC", "amount"], ["TARGET_AVG", "Custom: target CPA", "amount"]] },
		budget: { levels: { campaign: "Campaign budget optimization", adset: "Ad group budget" }, minDaily: {} },
		geoLevel: "adset",
		age: { kind: "buckets", options: [["ALL", "All ages (13+)"], ["18-24", "18-24"], ["21+", "21+"], ["25-34", "25-34"], ["35-44", "35-44"], ["45-49", "45-49"], ["50-54", "50-54"], ["55-64", "55-64"], ["65+", "65+"]] },
		genders: [["all", "All"], ["female", "Female"], ["male", "Male"], ["unspecified", "Unspecified"]],
		targeting: [["interests", "Interests"], ["keywords", "Keywords"], ["customAudiences", "Audiences (customer list, visitors, engagement)"], ["lookalikes", "Actalike audiences"], ["exclusions", "Excluded audiences"], ["devices", "Devices"]],
		placements: { automatic: "All placements", options: [["BROWSE", "Browse (home feed, related Pins)"], ["SEARCH", "Search"]] },
	},
	snapchat: {
		sources: ["developers.snap.com/api/marketing-api/Ads-API/campaigns", "developers.snap.com/api/marketing-api/Ads-API/ad-squads"],
		objectives: [
			{ id: "AWARENESS_AND_ENGAGEMENT", label: "Awareness & engagement", generic: "awareness", goals: [["IMPRESSIONS", "Impressions"], ["SWIPES", "Swipe ups"], ["VIDEO_VIEWS", "Video views"], ["VIDEO_VIEWS_15_SEC", "15-second video views"], ["STORY_OPENS", "Story opens"]] },
			{ id: "TRAFFIC", label: "Traffic", generic: "traffic", goals: [["SWIPES", "Swipe ups"], ["LANDING_PAGE_VIEW", "Landing page views"]] },
			{ id: "LEADS", label: "Leads", generic: "leads", goals: [["LEAD_FORM_SUBMISSIONS", "Lead form submissions"], ["PIXEL_SIGNUP", "Sign ups"], ["SWIPES", "Swipe ups"]] },
			{ id: "APP_PROMOTION", label: "App promotion", generic: "app", goals: [["APP_INSTALLS", "App installs"], ["APP_PURCHASE", "App purchases"], ["APP_SIGNUP", "App sign ups"], ["APP_REENGAGE_OPEN", "App re-engagement opens"], ["SWIPES", "Swipe ups"]] },
			{ id: "SALES", label: "Sales", generic: "sales", goals: [["PIXEL_PURCHASE", "Purchases"], ["PIXEL_PURCHASE_VO", "Purchase value"], ["PIXEL_ADD_TO_CART", "Add to cart"], ["PIXEL_SIGNUP", "Sign ups"], ["PIXEL_PAGE_VIEW", "Page views"], ["LANDING_PAGE_VIEW", "Landing page views"], ["SWIPES", "Swipe ups"]] },
		],
		bid: { level: "adset", strategies: [["AUTO_BID", "Auto-bid"], ["TARGET_COST", "Target cost", "amount"], ["LOWEST_COST_WITH_MAX_BID", "Max bid", "amount"]] },
		budget: { levels: { adset: "Ad squad budget" }, minDaily: { adset: 5 } },
		geoLevel: "adset",
		age: { kind: "range", min: 13, max: 50, plusAt: 50, default: [18, 50], confirm: true },
		genders: [["all", "All"], ["MALE", "Male"], ["FEMALE", "Female"]],
		targeting: [["lifestyleCategories", "Snap Lifestyle Categories"], ["customAudiences", "Snap Audience Match and pixel audiences"], ["lookalikes", "Lookalike audiences"], ["exclusions", "Excluded audiences"], ["devices", "Devices"]],
		placements: { automatic: "Automatic placements", options: [["INTERSTITIAL_USER", "Between friends' Stories"], ["INTERSTITIAL_CONTENT", "Between content"], ["INSTREAM", "Within content (Stories, Spotlight)"], ["FEED", "Feed"], ["CHAT_FEED", "Chat feed"], ["CAMERA", "Camera"]] },
	},
};

// Every catalog list is [id, label, flag?]; these read them uniformly.
export const options = (list) => (list ?? []).map((o) => (Array.isArray(o) ? { id: o[0], label: o[1], flag: o[2] } : o));
export const nativeObjectives = (p) => CATALOG[p]?.objectives ?? [];
export const nativeObjective = (p, id) => nativeObjectives(p).find((o) => o.id === id) ?? null;
export const defaultNative = (p, generic) => nativeObjectives(p).find((o) => o.generic === generic) ?? nativeObjectives(p)[0] ?? null;
export function goalsFor(p, objectiveId) {
	const o = nativeObjective(p, objectiveId);
	return options(o?.goals);
}
// Bid strategies at a level for a campaign: Google's depend on the campaign type; Meta's follow the budget.
export function bidStrategies(p, campaignType) {
	const c = CATALOG[p];
	if (!c) return [];
	const all = options(c.bid.strategies);
	if (p === "google") {
		const t = (c.campaignTypes ?? []).find((x) => x[0] === campaignType);
		return t ? all.filter((s) => t[3].includes(s.id)) : all;
	}
	return all;
}
export function bidLevel(p, budgetLevel) {
	const l = CATALOG[p]?.bid.level;
	return l === "budget" ? budgetLevel : l;
}
export const budgetLevels = (p) => Object.entries(CATALOG[p]?.budget.levels ?? { campaign: "Campaign budget" });
export const placementOptions = (p) => options(CATALOG[p]?.placements?.options);
export const targetingDims = (p) => options(CATALOG[p]?.targeting);
export const genderOptions = (p) => options(CATALOG[p]?.genders ?? [["all", "All"]]);
export const specialCategories = (p) => options(CATALOG[p]?.special);
export const googleTypes = () => (CATALOG.google.campaignTypes ?? []).map(([id, label, formats]) => ({ id, label, formats }));
export function ageLabel(p, d) {
	const a = CATALOG[p]?.age;
	if (!a) return "No age targeting";
	if (a.kind === "buckets") return d.ageBuckets?.length ? d.ageBuckets.map((b) => a.options.find((o) => o[0] === b)?.[1] ?? b).join(", ") : "All ages";
	const max = Number(d.ageMax);
	const plus = a.kind === "x" ? max === 0 : max >= a.plusAt;
	return `${d.ageMin}${plus ? "+" : `–${max}`}`;
}
