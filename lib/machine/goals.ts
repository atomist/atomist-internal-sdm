/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// GOAL Definition

import { QueryNoCacheOptions } from "@atomist/automation-client";
import {
    AutoCodeInspection,
    Autofix,
    Cancel,
    goals,
    Goals,
    GoalWithFulfillment,
    IndependentOfEnvironment,
    ProductionEnvironment,
    StagingEnvironment,
} from "@atomist/sdm";
import {
    Tag,
    Version,
} from "@atomist/sdm-core";
import {
    leinBuild,
    publish,
} from "@atomist/sdm-pack-clojure";
import { DockerBuild } from "@atomist/sdm-pack-docker";
import { elasticsearch } from "../services/elasticsearch";
import { neo4j } from "../services/neo4j";
import { FetchCommit } from "../typings/types";

export const autoCodeInspection = new AutoCodeInspection({ isolate: true });
export const autofix = new Autofix();
export const version = new Version();
export const tag = new Tag();
export const dockerBuild = new DockerBuild();

// GOALSET Definition

export const updateStagingK8Specs = new GoalWithFulfillment({
    uniqueName: "UpdateStagingK8Specs",
    environment: StagingEnvironment,
    orderedName: "5-update-staging-k8-specs",
    displayName: "update staging k8s specs",
    workingDescription: "Updating `staging` K8 specs...",
    completedDescription: "Updated `staging` K8 specs",
    failedDescription: "Update `staging` K8 specs failed",
    preCondition: {
        condition: async gi => {
            const images = await gi.context.graphClient.query<FetchCommit.Query, FetchCommit.Variables>({
                name: "fetchCommit",
                variables: {
                    sha: gi.goalEvent.sha,
                },
                options: QueryNoCacheOptions,
            });
            return images && images.Commit && images.Commit.length > 0;
        },
        retries: 5,
        timeoutSeconds: 5,
    },
    isolated: true,
});

export const deployToStaging = new GoalWithFulfillment({
    uniqueName: "deployToStaging",
    environment: StagingEnvironment,
    orderedName: "5.1-deploy-to-staging",
    displayName: "deploy to `staging`",
    workingDescription: "Deploying to `staging`",
    completedDescription: "Deployed to `staging`",
    failedDescription: "Deployment to `staging` failed",
    requestedDescription: "Waiting for `staging` deployment",
});

export const integrationTest = new GoalWithFulfillment({
    uniqueName: "integrationTest",
    environment: StagingEnvironment,
    orderedName: "6-integration-tests",
    displayName: "integration tests",
    workingDescription: "Integration tests running ...",
    completedDescription: "Integration tests passed",
    failedDescription: "Integration tests failed",
    retryFeasible: true,
});

export const updateProdK8Specs = new GoalWithFulfillment({
    uniqueName: "UpdateProdK8Specs",
    environment: ProductionEnvironment,
    orderedName: "7-update-prod-k8-specs",
    displayName: "update prod k8s specs",
    workingDescription: "Updating `prod` K8 specs...",
    completedDescription: "Updated `prod` K8 specs",
    failedDescription: "Update `prod` K8 specs failed",
    waitingForPreApprovalDescription: "Ready to update `prod` K8 specs",
    preApprovalRequired: true,
});

export const deployToProd = new GoalWithFulfillment({
    uniqueName: "deployToProd",
    environment: ProductionEnvironment,
    orderedName: "5.1-deploy-to-prod",
    displayName: "deploy to prod",
    workingDescription: "Deploying to `prod`",
    completedDescription: "Deployed to `prod`",
    failedDescription: "Deployment to `prod` failed",
    requestedDescription: "Waiting for `prod` deployment",
});

export const nodeVersion = new GoalWithFulfillment({
    uniqueName: "nodeVersion",
    environment: IndependentOfEnvironment,
    displayName: "update version",
    workingDescription: "Updating version",
    completedDescription: "Updated version",
    failedDescription: "Update version failed",
});

export const nodeDockerBuild = new DockerBuild();
export const neoApolloDockerBuild = new DockerBuild({
    uniqueName: "apollo-docker-build",
    displayName: "Apollo docker build",
    descriptions: {
        inProcess: "Running Apollo docker build",
        completed: "Apollo docker build successful",
        failed: "Apollo docker build failed",
    },
});
export const nodeTag = new Tag();

export const nodeServiceCancel = new Cancel({
    goals: [
        autofix,
        nodeVersion,
        nodeTag,
        nodeDockerBuild,
        updateStagingK8Specs,
        deployToStaging,
        updateProdK8Specs,
        deployToProd],
});

export const targetComplianceGoal = new GoalWithFulfillment(
    {
        uniqueName: "backpack-react-script-compliance",
        displayName: "backpack-compliance",
    },
).with(
    {
        name: "backpack-react-waiting",
    },
);

leinBuild.withService(elasticsearch("6.8.2"));
leinBuild.withService(neo4j());

// Just running review and autofix
export const CheckGoals: Goals = goals("Check")
    .plan(version, autoCodeInspection).after(autofix);

export const DefaultBranchGoals: Goals = goals("Default Branch")
    .plan(autofix);

// Build including docker build
export const LeinBuildGoals: Goals = goals("Lein Build")
    .plan(CheckGoals)
    .plan(leinBuild).after(version);

export const LeinDefaultBranchBuildGoals: Goals = goals("Lein Build")
    .plan(DefaultBranchGoals, LeinBuildGoals)
    .plan(publish).after(leinBuild, autoCodeInspection)
    .plan(tag).after(publish);

export const LeinDockerGoals: Goals = goals("Lein Docker Build")
    .plan(LeinBuildGoals)
    .plan(dockerBuild).after(leinBuild)
    .plan(tag).after(dockerBuild);

export const LeinDefaultBranchDockerGoals: Goals = goals("Lein Docker Build")
    .plan(DefaultBranchGoals, LeinDockerGoals)
    .plan(updateStagingK8Specs).after(tag, autoCodeInspection)
    .plan(deployToStaging).after(updateStagingK8Specs)
    .plan(updateProdK8Specs).after(deployToStaging)
    .plan(deployToProd).after(updateProdK8Specs);

export const LeinDefaultBranchIntegrationTestDockerGoals: Goals = goals("Lein Docker Build with Integration Test")
    .plan(DefaultBranchGoals, LeinDockerGoals)
    .plan(updateStagingK8Specs).after(tag, autoCodeInspection)
    .plan(deployToStaging).after(updateStagingK8Specs)
    .plan(integrationTest).after(deployToStaging)
    .plan(updateProdK8Specs).after(integrationTest)
    .plan(deployToProd).after(updateProdK8Specs);

export const LeinAndNodeDockerGoals: Goals = goals("Lein and npm combined goals")
    .plan(LeinBuildGoals, DefaultBranchGoals)
    .plan(neoApolloDockerBuild, dockerBuild).after(leinBuild)
    .plan(tag).after(neoApolloDockerBuild)
    .plan(updateStagingK8Specs).after(tag)
    .plan(deployToStaging).after(updateStagingK8Specs)
    .plan(updateProdK8Specs).after(deployToStaging)
    .plan(deployToProd).after(updateProdK8Specs);
