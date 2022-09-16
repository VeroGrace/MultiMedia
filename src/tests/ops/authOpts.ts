import assert from "assert";
import axios from "axios";
import * as mocha from "mocha";
import { getCollection } from "../../modules/mongo";
import { getTestAxiosUrl, sleep } from "../utils";

describe("validate authentication flow", () => {
	const email = "test@apparyllis.com"
	const password = "APasswordTh3tFitsTh3Regexp!";

	let userId = "";

	let accessToken = "";
	let refreshToken = "";

	mocha.test("Register a new user", async () => {
		const result = await axios.post(getTestAxiosUrl("v1/auth/register"), {email, password})
		assert(result.data)
		userId = result.data

		const firstAcc = await getCollection("accounts").findOne({email: {$ne: null}})
		assert(firstAcc)
	});

	mocha.test("Login new user", async () => {
		const result = await axios.post(getTestAxiosUrl("v1/auth/login"), {email, password})
		assert(result.data.access)
		assert(result.data.refresh)

		accessToken = result.data.access;
		refreshToken = result.data.refresh;
	});

	mocha.test("Request new confirm email", async () => {
		const result = await axios.post(getTestAxiosUrl("v1/auth/verification/request"), {}, { headers: { authorization: accessToken} }).catch((reason) => { return reason.response })
		assert(result.status == 400, "It should return 400, as we are rate-locked to one per minute and registering sends an email")
	});

	mocha.test("Confirm email", async () => {
		const firstAcc = await getCollection("accounts").findOne({email: {$ne: null}})
		const result = await axios.get(getTestAxiosUrl(`v1/auth/verification/confirm?uid=${firstAcc.uid}&key=${firstAcc.verificationCode}`))
		assert(result.status == 200)
		const firstAccVerified = await getCollection("accounts").findOne({email: {$ne: null}})
		assert(firstAccVerified.verified === true)

		const secondResult = await axios.get(getTestAxiosUrl(`v1/auth/verification/confirm?uid=${firstAcc.uid}&key=${firstAcc.verificationCode}`)).catch((reason) => { return reason.response })
		assert(secondResult.status == 400, "Verifying twice should not be possible")
	});

	mocha.test("Refresh JWT tokens", async () => {
		const failResult = await axios.get(getTestAxiosUrl("v1/auth/refresh"), { headers: { authorization: accessToken} }).catch((reason) => { return reason.response })
		assert(failResult.status == 401, "Refreshing with an access token is illegal!")

		// We need to sleep so that the jwt's from register and refresh won't be the same if iss and exp are identical for register and refresh
		await sleep(2000)

		const successResult = await axios.get(getTestAxiosUrl("v1/auth/refresh"), { headers: { authorization: refreshToken} })
		assert(successResult.status == 200, "Refreshing with a refresh token should be functional")

		assert(successResult.data.access)
		assert(successResult.data.refresh)

		assert(successResult.data.access !== accessToken)
		assert(successResult.data.refresh !== refreshToken)

		const failResult2 = await axios.get(getTestAxiosUrl("v1/auth/refresh"), { headers: { authorization: accessToken} }).catch((reason) => { return reason.response })
		assert(failResult2.status == 401, "Refreshing with a refresh token that was previously used, is illegal!")

		const successResult2 = await axios.get(getTestAxiosUrl("v1/auth/refresh"), { headers: { authorization: successResult.data.refresh} })
		assert(successResult2.status == 200, "Refreshing with the newly refresh token should be functional")
	}).timeout(4000);
})