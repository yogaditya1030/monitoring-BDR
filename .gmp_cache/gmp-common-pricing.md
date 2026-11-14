---
name: gmp-common-pricing
description: Provide comprehensive guidelines on Google Maps Platform pricing, including subscription tiers, pay-as-you-go model, free usage caps, volume discounts, and detailed CPM pricing tables.
license: Apache-2.0
metadata:
  version: 1.0.55
---

> [!IMPORTANT] **Core Dependency:** This skill requires active context from
> [google-maps-platform/SKILL.md](https://www.gstatic.com/googlemapsplatform-agent-skills/google-maps-platform/SKILL.md).

# Global Pricing Guidelines

This skill provides an overview of the Google Maps Platform pricing model, which
consists of flexible options for all usage levels, including pay-as-you-go,
tiered pricing, and subscription plans (cite: 10, 12). Pricing is calculated
based on monthly consumption per Stock Keeping Unit (SKU) (cite: 1, 11).

## Pricing Models

### 1. Subscription Tiers (Fixed Monthly Cost)

Subscription plans offer a predictable, fixed monthly fee for a combined usage
limit across included SKUs (cite: 6). These plans are available to self-service
customers (cite: 6).

| Plan           | Monthly | Combined Calls / | Example        | Key Focus     |
:                : Price   : Month            : Savings (vs.   :               :
:                :         :                  : Pay-as-you-go) :               :
| :------------- | :------ | :--------------- | :------------- | :------------ |
| **Starter**    | $100    | 50,000           | Up to $180     | Foundational  |
:                :         :                  : (cite\: 4, 10) : capabilities  :
:                :         :                  :                : (Dynamic      :
:                :         :                  :                : Maps,         :
:                :         :                  :                : Geocoding)    :
:                :         :                  :                : (cite\:       :
:                :         :                  :                : 4, 10)        :
| **Essentials** | $275    | 100,000          | Up to $625     | Most popular  |
:                :         :                  : (cite\: 4, 10) : products      :
:                :         :                  :                : across Maps,  :
:                :         :                  :                : Routes,       :
:                :         :                  :                : Places,       :
:                :         :                  :                : Environment   :
:                :         :                  :                : (cite\:       :
:                :         :                  :                : 4, 10)        :
| **Pro**        | $1,200  | 250,000          | Up to $5,000   | Advanced      |
:                :         :                  : (cite\: 4)     : features and  :
:                :         :                  :                : enhanced      :
:                :         :                  :                : customization :
:                :         :                  :                : (cite\: 4)    :
| **Enterprise** | Custom  | Custom           | Custom         | Maximum       |
:                :         :                  :                : flexibility   :
:                :         :                  :                : and control;  :
:                :         :                  :                : requires      :
:                :         :                  :                : contacting    :
:                :         :                  :                : sales         :
:                :         :                  :                : (cite\: 13)   :

### 2. Pay-as-you-go (Tiered Volume Pricing)

The default model operates on a tiered pricing structure where the cost per
thousand requests (CPM) automatically decreases as your monthly volume increases
(cite: 2, 5). Customers may choose a hybrid model that combines a subscription
plan with Pay-as-you-go for usage that exceeds the plan's fixed limit (cite: 4).

## Free Usage and Discounts

### Monthly Free Usage Caps

The former universal $200 monthly credit has been replaced with individual free
usage caps per SKU (Stock Keeping Unit) based on the tier the SKU belongs to
(cite: 5, 7, 13). The free usage limit is consumed first, and overages are
charged at the Pay-as-you-go rate for the next tier (cite: 5).

| SKU Category        | Free Monthly Calls (Per   | Use Case                 |
:                     : SKU)                      :                          :
| :------------------ | :------------------------ | :----------------------- |
| **Essentials SKUs** | 10,000 calls (cite: 2, 7) | Core and basic mapping   |
:                     :                           : functions (cite\: 1)     :
| **Pro SKUs**        | 5,000 calls (cite: 2, 7)  | More dynamic features    |
:                     :                           : (cite\: 1)               :
| **Enterprise SKUs** | 1,000 calls (cite: 2, 7)  | Advanced, transformative |
:                     :                           : capabilities (cite\: 1)  :

*Note: Some popular products like Maps Embed API and Maps SDK maintain unlimited
free usage (cite: 8).*

### Volume Discounts and Incentives

*   **Automatic Volume Discounts:** All Google Maps Platform Core Services SKUs
    have automatic, usage-based volume discounts (cite: 1, 2). These discounts
    are applied automatically as your usage crosses specified monthly volume
    thresholds, scaling to millions of monthly billable events (cite: 1, 5).
*   **New Customer Trial:** New customers receive a $300 trial credit toward any
    service or subscription plan (cite: 4, 10, 13).

## Frequently Asked Questions (FAQ)

*   **How does the tiered pricing model work?** Pricing is based on the number
    of requests sent to specific API services (cite: 2). As usage grows, you
    automatically move through successive pricing tiers, and a lower unit price
    is applied to the usage within that tier (cite: 2). Billing is calculated
    proportionally according to the tier (cite: 2).
*   **What are billable events?** A billable event can be a call to an API, a
    map load event, or a panorama load event (cite: 11).
*   **What are SKUs?** A Stock Keeping Unit (SKU) is a distinct, measurable item
    or feature that can be purchased from Google Maps Platform, each with a set
    price (cite: 5). One user action may trigger multiple SKUs (cite: 5).
*   **How can I view my usage?** You can view your billable usage by SKU in the
    Google Cloud Console billing dashboard (cite: 3, 5).

## Core Product Pricing (Cost Per Thousand - CPM)

The following tables illustrate the Pay-as-you-go CPM for select Google Maps
Platform products. Prices are for reference and may be updated by Google (cite:
9).

### Maps SKUs (Essentials/Pro Tiers)

| SKU Name      | Tier       | Free Monthly  | 0 - 100,000  | 100,001 -        |
:               :            : Cap (Per SKU) : Calls (CPM)  : 500,000 Calls    :
:               :            :               :              : (CPM)            :
| :------------ | :--------- | :------------ | :----------- | :--------------- |
| **Dynamic     | Essentials | 10,000        | $7.00 (cite: | $5.60 (cite:     |
: Maps**        :            : (cite\: 7)    : 7, 9)        : 7, 9)            :
| **Static      | Essentials | 10,000        | $2.00 (cite: | $1.60 (cite:     |
: Maps**        :            : (cite\: 7)    : 7, 9)        : 7, 9)            :
| **Dynamic     | Pro        | 5,000         | $14.00       | $11.20 (cite: 9) |
: Street View** :            : (cite\: 7)    : (cite\: 9)   :                  :

### Routes SKUs

| SKU Name           | Tier     | 0 - 100,000 Calls | 100,001 - 500,000 Calls |
:                    :          : (CPM)             : (CPM)                   :
| :----------------- | :------- | :---------------- | :---------------------- |
| **Directions API** | *Varies* | $5.00 (Example    | $4.00 (Example only -   |
:                    :          : only - check      : check official source)  :
:                    :          : official source)  :                         :
| **Distance Matrix  | *Varies* | $5.00 (Example    | $4.00 (Example only -   |
: API**              :          : only - check      : check official source)  :
:                    :          : official source)  :                         :

### Places SKUs

| SKU Name        | Tier       | 0 - 100,000 Calls     | 100,001 - 500,000     |
:                 :            : (CPM)                 : Calls (CPM)           :
| :-------------- | :--------- | :-------------------- | :-------------------- |
| **Place Details | Essentials | $5.00 (Example only - | $4.00 (Example only - |
: (Essentials     :            : check official        : check official        :
: Fields)**       :            : source)               : source)               :
| **Place Details | Pro        | $17.00 (Example       | $13.60 (Example       |
: (Pro Fields)**  :            : only - check official : only - check official :
:                 :            : source)               : source)               :
| **Geocoding**   | Essentials | $5.00 (Example only - | $4.00 (Example only - |
:                 :            : check official        : check official        :
:                 :            : source)               : source)               :

********************************************************************************

### References

For the most current, complete, and detailed pricing information, please consult
the official Google Maps Platform resources:

*   **Official Pricing Page:**
    [https://mapsplatform.google.com/pricing/](https://mapsplatform.google.com/pricing/?utm_campaign=gmp_git_agentskills_v1)
*   **Core Services Pricing List:**
    [https://cloud.google.com/maps-platform/pricing/sheet](https://cloud.google.com/maps-platform/pricing/sheet?utm_campaign=gmp_git_agentskills_v1)
*   **Pricing FAQs:**
    [https://developers.google.com/maps/billing-and-pricing/faq](https://developers.google.com/maps/billing-and-pricing/faq?utm_campaign=gmp_git_agentskills_v1)
*   **Subscription Details:**
    [https://cloud.google.com/maps-platform/pricing/subscriptions](https://cloud.google.com/maps-platform/pricing/subscriptions?utm_campaign=gmp_git_agentskills_v1)
*   **Pricing Documentation:**
    [https://cloud.google.com/maps-platform/pricing/documentation](https://cloud.google.com/maps-platform/pricing/documentation?utm_campaign=gmp_git_agentskills_v1)

### References

*   [https://developers.google.com/maps/pricing-and-billing/pricing-overview](https://developers.google.com/maps/pricing-and-billing/pricing-overview?utm_campaign=gmp_git_agentskills_v1)
